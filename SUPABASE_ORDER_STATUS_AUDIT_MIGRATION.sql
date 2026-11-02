create table if not exists public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status text not null,
  new_status text not null,
  changed_at timestamptz not null default now(),
  changed_by_uid text,
  changed_by_email text
);

create index if not exists order_status_history_order_changed_at_idx
  on public.order_status_history (order_id, changed_at desc);

alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from public, anon, authenticated, service_role;
grant select on public.order_status_history to service_role;

create or replace function public.record_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.order_status_history (
    order_id,
    previous_status,
    new_status,
    changed_by_uid,
    changed_by_email
  ) values (
    new.id,
    old.status,
    new.status,
    nullif(current_setting('app.order_status_actor_uid', true), ''),
    nullif(current_setting('app.order_status_actor_email', true), '')
  );

  return new;
end;
$$;

revoke all on function public.record_order_status_change() from public, anon, authenticated;

drop trigger if exists orders_record_status_change on public.orders;
create trigger orders_record_status_change
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.record_order_status_change();

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status text,
  p_notes text default null,
  p_update_notes boolean default false,
  p_actor_uid text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_result jsonb;
begin
  if p_status is null or p_status not in ('awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled') then
    raise exception using message = 'INVALID_ORDER_STATUS', errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using message = 'ORDER_NOT_FOUND', errcode = 'P0002';
  end if;

  if v_order.stripe_stock_reserved and p_status <> 'awaiting_payment' then
    raise exception using message = 'STRIPE_STOCK_RESERVED', errcode = 'P0001';
  end if;

  if (v_order.stripe_payment_intent_id is not null or v_order.stripe_paid_at is not null)
    and p_status in ('awaiting_payment', 'cancelled') then
    raise exception using message = 'STRIPE_PAYMENT_CONFIRMED', errcode = 'P0001';
  end if;

  if v_order.stripe_checkout_session_id is not null
    and v_order.status = 'cancelled'
    and p_status <> 'cancelled' then
    raise exception using message = 'STRIPE_CHECKOUT_CANCELLED', errcode = 'P0001';
  end if;

  if p_status = 'paid'
    and v_order.stripe_checkout_session_id is not null
    and v_order.status <> 'paid' then
    raise exception using message = 'STRIPE_PAYMENT_REQUIRES_WEBHOOK', errcode = 'P0001';
  end if;

  perform set_config('app.order_status_actor_uid', coalesce(left(p_actor_uid, 128), ''), true);
  perform set_config('app.order_status_actor_email', coalesce(left(p_actor_email, 320), ''), true);

  if p_status = 'paid' then
    v_result := public.mark_order_paid_and_deduct_inventory(
      p_order_id,
      p_notes,
      p_update_notes
    );
  else
    update public.orders
    set status = p_status,
        notes = case when p_update_notes then p_notes else notes end
    where id = p_order_id;
    v_result := jsonb_build_object('order_id', p_order_id, 'already_paid', false);
  end if;

  return v_result || jsonb_build_object('status', p_status);
end;
$$;

revoke all on function public.admin_update_order_status(uuid, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_order_status(uuid, text, text, boolean, text, text) to service_role;

alter table public.profiles
  add column if not exists whatsapp_order_updates_opt_in boolean not null default false;

alter table public.orders
  add column if not exists order_confirmation_email_status text not null default 'pending'
    check (order_confirmation_email_status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  add column if not exists order_confirmation_email_started_at timestamptz,
  add column if not exists order_confirmation_email_sent_at timestamptz,
  add column if not exists order_confirmation_email_provider_id text,
  add column if not exists order_confirmation_email_error text,
  add column if not exists order_confirmation_whatsapp_status text not null default 'pending'
    check (order_confirmation_whatsapp_status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  add column if not exists order_confirmation_whatsapp_started_at timestamptz,
  add column if not exists order_confirmation_whatsapp_sent_at timestamptz,
  add column if not exists order_confirmation_whatsapp_provider_id text,
  add column if not exists order_confirmation_whatsapp_error text;

create or replace function public.claim_order_confirmation_notification(
  p_order_id uuid,
  p_channel text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_status text;
  v_started_at timestamptz;
begin
  if p_channel is null or p_channel not in ('email', 'whatsapp') then
    raise exception using message = 'INVALID_ORDER_NOTIFICATION_CHANNEL', errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using message = 'ORDER_NOT_FOUND', errcode = 'P0002';
  end if;
  if v_order.status <> 'paid' or v_order.stripe_paid_at is null then
    return false;
  end if;

  if p_channel = 'email' then
    v_status := v_order.order_confirmation_email_status;
    v_started_at := v_order.order_confirmation_email_started_at;
  else
    v_status := v_order.order_confirmation_whatsapp_status;
    v_started_at := v_order.order_confirmation_whatsapp_started_at;
  end if;

  if v_status in ('sent', 'skipped')
    or (v_status = 'sending' and v_started_at > now() - interval '15 minutes') then
    return false;
  end if;

  if p_channel = 'email' then
    update public.orders
    set order_confirmation_email_status = 'sending',
        order_confirmation_email_started_at = now(),
        order_confirmation_email_error = null
    where id = p_order_id;
  else
    update public.orders
    set order_confirmation_whatsapp_status = 'sending',
        order_confirmation_whatsapp_started_at = now(),
        order_confirmation_whatsapp_error = null
    where id = p_order_id;
  end if;

  return true;
end;
$$;

create or replace function public.finish_order_confirmation_notification(
  p_order_id uuid,
  p_channel text,
  p_status text,
  p_provider_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_channel is null or p_channel not in ('email', 'whatsapp')
    or p_status is null or p_status not in ('sent', 'skipped', 'failed') then
    raise exception using message = 'INVALID_ORDER_NOTIFICATION_STATE', errcode = '22023';
  end if;

  if p_channel = 'email' then
    update public.orders
    set order_confirmation_email_status = p_status,
        order_confirmation_email_sent_at = case when p_status = 'sent' then now() else null end,
        order_confirmation_email_provider_id = left(p_provider_id, 255),
        order_confirmation_email_error = left(p_error, 500)
    where id = p_order_id and order_confirmation_email_status = 'sending';
  else
    update public.orders
    set order_confirmation_whatsapp_status = p_status,
        order_confirmation_whatsapp_sent_at = case when p_status = 'sent' then now() else null end,
        order_confirmation_whatsapp_provider_id = left(p_provider_id, 255),
        order_confirmation_whatsapp_error = left(p_error, 500)
    where id = p_order_id and order_confirmation_whatsapp_status = 'sending';
  end if;

  return found;
end;
$$;

revoke all on function public.claim_order_confirmation_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_order_confirmation_notification(uuid, text) to service_role;
revoke all on function public.finish_order_confirmation_notification(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_order_confirmation_notification(uuid, text, text, text, text) to service_role;

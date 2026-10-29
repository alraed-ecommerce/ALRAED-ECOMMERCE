create table if not exists public.checkout_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null default 'fixed' check (discount_type = 'fixed'),
  discount_amount numeric(10, 2) not null check (discount_amount > 0),
  is_active boolean not null default true,
  starts_at date,
  expires_at date,
  minimum_subtotal numeric(10, 2) check (minimum_subtotal is null or minimum_subtotal >= 0),
  maximum_redemptions integer check (maximum_redemptions is null or maximum_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  reserved_redemptions integer not null default 0 check (reserved_redemptions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkout_coupons_date_range_check check (starts_at is null or expires_at is null or starts_at <= expires_at)
);

create unique index if not exists checkout_coupons_code_ci_key
  on public.checkout_coupons (upper(code));

alter table public.checkout_coupons enable row level security;
revoke all on public.checkout_coupons from public, anon, authenticated;
grant all on public.checkout_coupons to service_role;

alter table public.orders
  add column if not exists product_subtotal numeric(10, 2),
  add column if not exists delivery_fee numeric(10, 2) not null default 10.00,
  add column if not exists handling_fee numeric(10, 2) not null default 2.00,
  add column if not exists coupon_id uuid,
  add column if not exists coupon_code text,
  add column if not exists coupon_discount numeric(10, 2) not null default 0,
  add column if not exists coupon_redemption_reserved boolean not null default false,
  add column if not exists checkout_attempt_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_coupon_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_coupon_id_fkey
      foreign key (coupon_id) references public.checkout_coupons(id) on delete set null;
  end if;
end;
$$;

create unique index if not exists orders_user_checkout_attempt_key
  on public.orders (user_id, checkout_attempt_id)
  where checkout_attempt_id is not null;

create or replace function public.apply_stripe_checkout_pricing(
  p_order_id uuid,
  p_coupon_code text,
  p_checkout_attempt_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_coupon public.checkout_coupons%rowtype;
  v_code text := upper(btrim(coalesce(p_coupon_code, '')));
  v_subtotal numeric(10, 2);
  v_discount numeric(10, 2) := 0;
  v_coupon_id uuid;
begin
  if p_checkout_attempt_id is null then
    raise exception using message = 'INVALID_CHECKOUT_ATTEMPT', errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'awaiting_payment' or v_order.stripe_stock_reserved is distinct from true then
    raise exception using message = 'STRIPE_ORDER_NOT_PAYABLE', errcode = 'P0001';
  end if;

  if v_order.checkout_attempt_id is not null then
    if v_order.checkout_attempt_id is distinct from p_checkout_attempt_id then
      raise exception using message = 'CHECKOUT_ATTEMPT_MISMATCH', errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'order_id', v_order.id,
      'total', v_order.total,
      'product_subtotal', v_order.product_subtotal,
      'delivery_fee', v_order.delivery_fee,
      'handling_fee', v_order.handling_fee,
      'coupon_code', v_order.coupon_code,
      'coupon_discount', v_order.coupon_discount,
      'checkout_session_id', v_order.stripe_checkout_session_id,
      'session_expires_at', floor(extract(epoch from (v_order.created_at + interval '1 hour')))::bigint,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_name', item.product_name,
          'quantity', item.quantity,
          'unit_price', item.unit_price
        ) order by item.id)
        from public.order_items item where item.order_id = v_order.id
      ), '[]'::jsonb)
    );
  end if;

  v_subtotal := v_order.total;
  if v_code <> '' then
    select * into v_coupon
    from public.checkout_coupons
    where upper(code) = v_code
    for update;

    if not found then
      raise exception using message = 'COUPON_INVALID:That coupon code was not found.', errcode = 'P0001';
    end if;
    if not v_coupon.is_active then
      raise exception using message = 'COUPON_INVALID:That coupon is inactive.', errcode = 'P0001';
    end if;
    if v_coupon.starts_at is not null and v_coupon.starts_at > current_date then
      raise exception using message = 'COUPON_INVALID:That coupon is not active yet.', errcode = 'P0001';
    end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at < current_date then
      raise exception using message = 'COUPON_INVALID:That coupon has expired.', errcode = 'P0001';
    end if;
    if v_coupon.minimum_subtotal is not null and v_subtotal < v_coupon.minimum_subtotal then
      raise exception using message = 'COUPON_INVALID:Your product subtotal does not meet this coupon minimum.', errcode = 'P0001';
    end if;
    if v_coupon.maximum_redemptions is not null
      and v_coupon.redemption_count + v_coupon.reserved_redemptions >= v_coupon.maximum_redemptions then
      raise exception using message = 'COUPON_INVALID:That coupon has reached its redemption limit.', errcode = 'P0001';
    end if;

    v_coupon_id := v_coupon.id;
    v_discount := least(v_coupon.discount_amount, v_subtotal);
    update public.checkout_coupons
    set reserved_redemptions = reserved_redemptions + 1,
        updated_at = now()
    where id = v_coupon.id;
  end if;

  update public.orders
  set product_subtotal = v_subtotal,
      delivery_fee = 10.00,
      handling_fee = 2.00,
      coupon_id = v_coupon_id,
      coupon_code = nullif(v_code, ''),
      coupon_discount = v_discount,
      coupon_redemption_reserved = v_coupon_id is not null,
      checkout_attempt_id = p_checkout_attempt_id,
      total = greatest(0, v_subtotal + 10.00 + 2.00 - v_discount)
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'order_id', v_order.id,
    'total', v_order.total,
    'product_subtotal', v_order.product_subtotal,
    'delivery_fee', v_order.delivery_fee,
    'handling_fee', v_order.handling_fee,
    'coupon_code', v_order.coupon_code,
    'coupon_discount', v_order.coupon_discount,
    'checkout_session_id', v_order.stripe_checkout_session_id,
    'session_expires_at', floor(extract(epoch from (v_order.created_at + interval '1 hour')))::bigint,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', item.product_name,
        'quantity', item.quantity,
        'unit_price', item.unit_price
      ) order by item.id)
      from public.order_items item where item.order_id = v_order.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_stripe_checkout_order_once(
  p_checkout_attempt_id uuid,
  p_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_city text,
  p_address text,
  p_notes text,
  p_items jsonb,
  p_variant_schema_version integer,
  p_coupon_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_created jsonb;
  v_priced jsonb;
begin
  if p_checkout_attempt_id is null then
    raise exception using message = 'INVALID_CHECKOUT_ATTEMPT', errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_checkout_attempt_id::text, 0));

  select * into v_order
  from public.orders
  where user_id = p_user_id and checkout_attempt_id = p_checkout_attempt_id
  for update;

  if found then
    if v_order.status <> 'awaiting_payment' or v_order.stripe_stock_reserved is distinct from true then
      raise exception using message = 'CHECKOUT_ATTEMPT_USED', errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'order_id', v_order.id,
      'total', v_order.total,
      'product_subtotal', v_order.product_subtotal,
      'delivery_fee', v_order.delivery_fee,
      'handling_fee', v_order.handling_fee,
      'coupon_code', v_order.coupon_code,
      'coupon_discount', v_order.coupon_discount,
      'checkout_session_id', v_order.stripe_checkout_session_id,
      'session_expires_at', floor(extract(epoch from (v_order.created_at + interval '1 hour')))::bigint,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_name', item.product_name,
          'quantity', item.quantity,
          'unit_price', item.unit_price
        ) order by item.id)
        from public.order_items item where item.order_id = v_order.id
      ), '[]'::jsonb)
    );
  end if;

  v_created := public.create_stripe_checkout_order(
    p_user_id, p_customer_name, p_customer_phone, p_city, p_address, p_notes, p_items, p_variant_schema_version
  );
  v_priced := public.apply_stripe_checkout_pricing(
    (v_created ->> 'order_id')::uuid, p_coupon_code, p_checkout_attempt_id
  );
  return v_priced;
end;
$$;

create or replace function public.update_checkout_coupon_redemption()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.coupon_redemption_reserved is true
    and new.status in ('paid', 'cancelled')
    and old.status = 'awaiting_payment' then
    update public.checkout_coupons
    set reserved_redemptions = greatest(0, reserved_redemptions - 1),
        redemption_count = redemption_count + case when new.status = 'paid' then 1 else 0 end,
        updated_at = now()
    where id = old.coupon_id;

    new.coupon_redemption_reserved := false;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_checkout_coupon_redemption on public.orders;
create trigger orders_checkout_coupon_redemption
before update of status on public.orders
for each row execute function public.update_checkout_coupon_redemption();

revoke all on function public.apply_stripe_checkout_pricing(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.create_stripe_checkout_order_once(uuid, uuid, text, text, text, text, text, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.update_checkout_coupon_redemption() from public, anon, authenticated;
grant execute on function public.apply_stripe_checkout_pricing(uuid, text, uuid) to service_role;
grant execute on function public.create_stripe_checkout_order_once(uuid, uuid, text, text, text, text, text, jsonb, integer, text) to service_role;

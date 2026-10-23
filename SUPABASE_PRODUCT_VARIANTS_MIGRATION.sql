alter table public.products
  add column if not exists colors text[] not null default '{}'::text[],
  add column if not exists sizes text[] not null default '{}'::text[],
  add column if not exists unavailable_sizes text[] not null default '{}'::text[],
  add column if not exists product_type text not null default 'other',
  add column if not exists size_category text,
  add column if not exists size_stock jsonb not null default '{}'::jsonb;

update public.products
set product_type = case
  when name ~* '(shoe|sneaker)' then 'shoe'
  when name ~* '(racket|racquet)' then 'racquet'
  else product_type
end
where product_type = 'other';

update public.products
set size_category = 'mens'
where product_type = 'shoe' and size_category is null;

update public.products as product
set colors = '{}'::text[],
    sizes = array(
      select 'UK ' || size_number
      from generate_series(2, case when product.size_category = 'mens' then 15 else 11 end) as size_number
      order by size_number
    ),
    unavailable_sizes = array(
      select 'UK ' || size_number
      from generate_series(2, case when product.size_category = 'mens' then 15 else 11 end) as size_number
      order by size_number
    ),
    size_stock = (
      select jsonb_object_agg('UK ' || size_number, 0)
      from generate_series(2, case when product.size_category = 'mens' then 15 else 11 end) as size_number
    )
where product.product_type = 'shoe'
  and product.size_stock = '{}'::jsonb;

drop function if exists public.create_stripe_checkout_order(uuid, text, text, text, text, text, jsonb);

create or replace function public.create_stripe_checkout_order(
  p_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_city text,
  p_address text,
  p_notes text,
  p_items jsonb,
  p_variant_schema_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_saved_item jsonb;
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_order_items jsonb := '[]'::jsonb;
  v_product_id bigint;
  v_quantity integer;
  v_reserved_quantity integer;
  v_requested_product_quantity integer;
  v_color text;
  v_size text;
  v_product_name text;
  v_total numeric(10, 2) := 0;
begin
  if p_variant_schema_version is distinct from 1 then
    raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'product_id')::bigint;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
    end;

    if v_product_id <= 0 or v_quantity < 1 or v_quantity > 50
      or (v_item ? 'color' and jsonb_typeof(v_item -> 'color') is distinct from 'string')
      or (v_item ? 'size' and jsonb_typeof(v_item -> 'size') is distinct from 'string') then
      raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
    end if;

    v_color := nullif(btrim(v_item ->> 'color'), '');
    v_size := nullif(btrim(v_item ->> 'size'), '');
    if (v_color is not null and length(v_color) > 40)
      or (v_size is not null and length(v_size) > 40) then
      raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and is_active = true
    for update;

    if not found then
      raise exception using message = 'PRODUCT_UNAVAILABLE:' || v_product_id, errcode = 'P0001';
    end if;

    if (cardinality(v_product.colors) > 0 and v_color is null)
      or ((cardinality(v_product.sizes) > 0 or v_product.product_type = 'shoe' or v_product.name ~* '(shoe|sneaker)') and v_size is null)
      or ((v_product.product_type = 'shoe' or v_product.name ~* '(shoe|sneaker)') and cardinality(v_product.sizes) = 0) then
      raise exception using message = 'PRODUCT_VARIANT_REQUIRED:' || v_product_id, errcode = 'P0001';
    end if;
    if (v_color is not null and not (v_color = any(v_product.colors)))
      or (v_size is not null and (
        not (v_size = any(v_product.sizes))
        or v_size = any(v_product.unavailable_sizes)
      )) then
      raise exception using message = 'INVALID_PRODUCT_VARIANT:' || v_product_id, errcode = 'P0001';
    end if;

    select coalesce(sum(quantity), 0)::integer into v_reserved_quantity
    from public.stripe_order_stock_reservations
    where product_id = v_product_id;

    select coalesce(sum((line.value ->> 'quantity')::integer), 0)::integer
    into v_requested_product_quantity
    from jsonb_array_elements(v_order_items) as line(value)
    where (line.value ->> 'product_id')::bigint = v_product_id;
    v_requested_product_quantity := v_requested_product_quantity + v_quantity;

    if coalesce(v_product.stock, 0) - v_reserved_quantity < v_requested_product_quantity then
      raise exception using message = 'INSUFFICIENT_STOCK:' || v_product_id, errcode = 'P0001';
    end if;

    v_product_name := v_product.name;
    if v_color is not null or v_size is not null then
      v_product_name := v_product_name || ' (' || concat_ws(', ',
        case when v_color is not null then 'Color: ' || v_color end,
        case when v_size is not null then 'Size: ' || v_size end
      ) || ')';
    end if;

    v_total := v_total + (v_product.price * v_quantity);
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product_name,
      'quantity', v_quantity,
      'unit_price', v_product.price
    ));
  end loop;

  insert into public.orders (
    user_id, customer_name, customer_phone, city, address, notes, total, status, stripe_stock_reserved
  ) values (
    p_user_id, p_customer_name, p_customer_phone, p_city, p_address,
    nullif(p_notes, ''), v_total, 'awaiting_payment', true
  ) returning * into v_order;

  for v_saved_item in select value from jsonb_array_elements(v_order_items)
  loop
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
    values (
      v_order.id,
      (v_saved_item ->> 'product_id')::bigint,
      v_saved_item ->> 'product_name',
      (v_saved_item ->> 'quantity')::integer,
      (v_saved_item ->> 'unit_price')::numeric
    );
  end loop;

  insert into public.stripe_order_stock_reservations (order_id, product_id, quantity)
  select
    v_order.id,
    (line.value ->> 'product_id')::bigint,
    sum((line.value ->> 'quantity')::integer)::integer
  from jsonb_array_elements(v_order_items) as line(value)
  group by (line.value ->> 'product_id');

  return jsonb_build_object(
    'order_id', v_order.id,
    'total', v_total,
    'items', v_order_items
  );
end;
$$;

revoke all on function public.create_stripe_checkout_order(uuid, text, text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_stripe_checkout_order(uuid, text, text, text, text, text, jsonb, integer) to service_role;

alter table public.stripe_order_stock_reservations
  add column if not exists size_key text not null default '';

do $$
declare
  v_primary_key text;
begin
  select constraint_row.conname into v_primary_key
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.stripe_order_stock_reservations'::regclass
    and constraint_row.contype = 'p';
  if v_primary_key is not null then
    execute format('alter table public.stripe_order_stock_reservations drop constraint %I', v_primary_key);
  end if;
  alter table public.stripe_order_stock_reservations
    add constraint stripe_order_stock_reservations_pkey primary key (order_id, product_id, size_key);
end;
$$;

drop function if exists public.create_stripe_checkout_order(uuid, text, text, text, text, text, jsonb);
drop function if exists public.create_stripe_checkout_order(uuid, text, text, text, text, text, jsonb, integer);

create or replace function public.set_product_size_stock_with_reservations(
  p_product_id bigint,
  p_size_category text,
  p_size_stock jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sizes text[];
  v_invalid_count integer;
  v_reserved_count integer;
  v_size text;
  v_quantity integer;
  v_product public.products%rowtype;
begin
  if p_size_category is null
    or p_size_category not in ('mens', 'womens', 'kids')
    or jsonb_typeof(p_size_stock) is distinct from 'object' then
    raise exception using message = 'INVALID_SIZE_STOCK', errcode = '22023';
  end if;

  select array_agg('UK ' || size_number order by size_number)
  into v_sizes
  from generate_series(2, case when p_size_category = 'mens' then 15 else 11 end) as size_number;

  if (select count(*) from jsonb_object_keys(p_size_stock)) <> cardinality(v_sizes) then
    raise exception using message = 'INVALID_SIZE_STOCK', errcode = '22023';
  end if;

  select count(*) into v_invalid_count
  from jsonb_each_text(p_size_stock) as entry(size_name, quantity)
  where not (entry.size_name = any(v_sizes))
    or entry.quantity !~ '^[0-9]+$'
    or case when entry.quantity ~ '^[0-9]+$' then entry.quantity::numeric > 100000 else false end;
  if v_invalid_count > 0 or exists (
    select 1 from unnest(v_sizes) as expected(size_name)
    where not (p_size_stock ? expected.size_name)
  ) then
    raise exception using message = 'INVALID_SIZE_STOCK', errcode = '22023';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception using message = 'PRODUCT_NOT_FOUND', errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.stripe_order_stock_reservations
    where product_id = p_product_id and size_key = ''
  ) then
    raise exception using message = 'SIZE_STOCK_BELOW_CHECKOUT_RESERVATIONS:legacy', errcode = 'P0001';
  end if;

  for v_size, v_quantity in
    select entry.size_name, entry.quantity::integer
    from jsonb_each_text(p_size_stock) as entry(size_name, quantity)
  loop
    select coalesce(sum(quantity), 0)::integer into v_reserved_count
    from public.stripe_order_stock_reservations
    where product_id = p_product_id and size_key = v_size;
    if v_quantity < v_reserved_count then
      raise exception using message = 'SIZE_STOCK_BELOW_CHECKOUT_RESERVATIONS:' || v_size, errcode = 'P0001';
    end if;
  end loop;

  update public.products
  set product_type = 'shoe',
      size_category = p_size_category,
      colors = '{}'::text[],
      sizes = v_sizes,
      unavailable_sizes = array(
        select entry.size_name
        from jsonb_each_text(p_size_stock) as entry(size_name, quantity)
        where entry.quantity::integer = 0
        order by entry.size_name
      ),
      size_stock = p_size_stock,
      stock = (
        select coalesce(sum(entry.quantity::integer), 0)::integer
        from jsonb_each_text(p_size_stock) as entry(size_name, quantity)
      )
  where id = p_product_id;
end;
$$;

drop function if exists public.create_stripe_checkout_order(uuid, text, text, text, text, text, jsonb, integer);

create function public.create_stripe_checkout_order(
  p_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_city text,
  p_address text,
  p_notes text,
  p_items jsonb,
  p_variant_schema_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_saved_item jsonb;
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_order_items jsonb := '[]'::jsonb;
  v_product_id bigint;
  v_quantity integer;
  v_reserved_quantity integer;
  v_reserved_size_quantity integer;
  v_requested_product_quantity integer;
  v_requested_size_quantity integer;
  v_color text;
  v_size text;
  v_size_quantity integer;
  v_product_name text;
  v_total numeric(10, 2) := 0;
begin
  if p_variant_schema_version is distinct from 2 then
    raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'product_id')::bigint;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
    end;

    if v_product_id <= 0 or v_quantity < 1 or v_quantity > 50
      or (v_item ? 'color' and jsonb_typeof(v_item -> 'color') is distinct from 'string')
      or (v_item ? 'size' and jsonb_typeof(v_item -> 'size') is distinct from 'string') then
      raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
    end if;

    v_color := nullif(btrim(v_item ->> 'color'), '');
    v_size := nullif(btrim(v_item ->> 'size'), '');
    if (v_color is not null and length(v_color) > 40)
      or (v_size is not null and length(v_size) > 40) then
      raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id and is_active = true
    for update;
    if not found then
      raise exception using message = 'PRODUCT_UNAVAILABLE:' || v_product_id, errcode = 'P0001';
    end if;

    if (cardinality(v_product.colors) > 0 and v_color is null)
      or ((cardinality(v_product.sizes) > 0 or v_product.product_type = 'shoe' or v_product.name ~* '(shoe|sneaker)') and v_size is null)
      or ((v_product.product_type = 'shoe' or v_product.name ~* '(shoe|sneaker)') and cardinality(v_product.sizes) = 0)
      or (v_product.product_type = 'shoe' and v_color is not null) then
      raise exception using message = 'PRODUCT_VARIANT_REQUIRED:' || v_product_id, errcode = 'P0001';
    end if;
    if (v_color is not null and not (v_color = any(v_product.colors)))
      or (v_size is not null and (
        not (v_size = any(v_product.sizes))
        or v_size = any(v_product.unavailable_sizes)
      )) then
      raise exception using message = 'INVALID_PRODUCT_VARIANT:' || v_product_id, errcode = 'P0001';
    end if;

    select coalesce(sum(quantity), 0)::integer into v_reserved_quantity
    from public.stripe_order_stock_reservations
    where product_id = v_product_id;
    select coalesce(sum((line.value ->> 'quantity')::integer), 0)::integer
    into v_requested_product_quantity
    from jsonb_array_elements(v_order_items) as line(value)
    where (line.value ->> 'product_id')::bigint = v_product_id;
    v_requested_product_quantity := v_requested_product_quantity + v_quantity;
    if v_product.product_type <> 'shoe'
      and coalesce(v_product.stock, 0) - v_reserved_quantity < v_requested_product_quantity then
      raise exception using message = 'INSUFFICIENT_STOCK:' || v_product_id, errcode = 'P0001';
    end if;

    if v_product.product_type = 'shoe' then
      if exists (
        select 1 from public.stripe_order_stock_reservations
        where product_id = v_product_id and size_key = ''
      ) then
        raise exception using message = 'INSUFFICIENT_SIZE_STOCK:' || v_product_id || ':legacy', errcode = 'P0001';
      end if;
      v_size_quantity := coalesce((v_product.size_stock ->> v_size)::integer, 0);
      select coalesce(sum(quantity), 0)::integer into v_reserved_size_quantity
      from public.stripe_order_stock_reservations
      where product_id = v_product_id and size_key = v_size;
      select coalesce(sum((line.value ->> 'quantity')::integer), 0)::integer
      into v_requested_size_quantity
      from jsonb_array_elements(v_order_items) as line(value)
      where (line.value ->> 'product_id')::bigint = v_product_id
        and line.value ->> 'size' = v_size;
      v_requested_size_quantity := v_requested_size_quantity + v_quantity;
      if v_size_quantity - v_reserved_size_quantity < v_requested_size_quantity then
        raise exception using message = 'INSUFFICIENT_SIZE_STOCK:' || v_product_id || ':' || v_size, errcode = 'P0001';
      end if;
    end if;

    v_product_name := v_product.name;
    if v_color is not null or v_size is not null then
      v_product_name := v_product_name || ' (' || concat_ws(', ',
        case when v_color is not null then 'Color: ' || v_color end,
        case when v_size is not null then 'Size: ' || v_size end
      ) || ')';
    end if;

    v_total := v_total + (v_product.price * v_quantity);
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product_name,
      'quantity', v_quantity,
      'unit_price', v_product.price,
      'size', coalesce(v_size, '')
    ));
  end loop;

  insert into public.orders (
    user_id, customer_name, customer_phone, city, address, notes, total, status, stripe_stock_reserved
  ) values (
    p_user_id, p_customer_name, p_customer_phone, p_city, p_address,
    nullif(p_notes, ''), v_total, 'awaiting_payment', true
  ) returning * into v_order;

  for v_saved_item in select value from jsonb_array_elements(v_order_items)
  loop
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
    values (
      v_order.id,
      (v_saved_item ->> 'product_id')::bigint,
      v_saved_item ->> 'product_name',
      (v_saved_item ->> 'quantity')::integer,
      (v_saved_item ->> 'unit_price')::numeric
    );
  end loop;

  insert into public.stripe_order_stock_reservations (order_id, product_id, size_key, quantity)
  select
    v_order.id,
    (line.value ->> 'product_id')::bigint,
    coalesce(line.value ->> 'size', ''),
    sum((line.value ->> 'quantity')::integer)::integer
  from jsonb_array_elements(v_order_items) as line(value)
  group by (line.value ->> 'product_id'), coalesce(line.value ->> 'size', '');

  return jsonb_build_object('order_id', v_order.id, 'total', v_total, 'items', v_order_items);
end;
$$;

create or replace function public.mark_stripe_order_paid(
  p_order_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_payment_method text,
  p_amount_total bigint,
  p_currency text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reservation record;
  v_updated_product_id bigint;
  v_size_quantity integer;
  v_updated_size_stock jsonb;
begin
  if p_session_id is null or p_payment_intent_id is null then
    raise exception using message = 'STRIPE_PAYMENT_REFERENCE_MISSING', errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using message = 'ORDER_NOT_FOUND', errcode = 'P0002'; end if;

  if v_order.stripe_paid_at is not null or v_order.stripe_payment_intent_id is not null then
    if v_order.stripe_checkout_session_id is distinct from p_session_id
      or v_order.stripe_payment_intent_id is distinct from p_payment_intent_id then
      raise exception using message = 'STRIPE_PAYMENT_MISMATCH', errcode = 'P0001';
    end if;
    return jsonb_build_object('order_id', p_order_id, 'already_paid', true);
  end if;

  if v_order.status <> 'awaiting_payment'
    or v_order.stripe_checkout_session_id <> p_session_id
    or v_order.stripe_stock_reserved is distinct from true then
    raise exception using message = 'STRIPE_ORDER_NOT_PAYABLE', errcode = 'P0001';
  end if;
  if p_currency is distinct from 'aed'
    or p_amount_total is distinct from round(v_order.total * 100)::bigint then
    raise exception using message = 'STRIPE_AMOUNT_MISMATCH', errcode = 'P0001';
  end if;

  if not exists (select 1 from public.stripe_order_stock_reservations where order_id = p_order_id)
    or exists (
      select 1
      from (
        select product_id, sum(quantity)::integer as quantity
        from public.order_items where order_id = p_order_id group by product_id
      ) as order_items
      full join (
        select product_id, sum(quantity)::integer as quantity
        from public.stripe_order_stock_reservations where order_id = p_order_id group by product_id
      ) as reservations using (product_id)
      where order_items.quantity is distinct from reservations.quantity
    ) then
    raise exception using message = 'STRIPE_ORDER_RESERVATION_MISMATCH', errcode = 'P0001';
  end if;

  for v_reservation in
    select product_id, size_key, quantity
    from public.stripe_order_stock_reservations
    where order_id = p_order_id
    order by product_id, size_key
  loop
    if v_reservation.size_key <> '' then
      select coalesce((size_stock ->> v_reservation.size_key)::integer, 0)
      into v_size_quantity
      from public.products where id = v_reservation.product_id for update;
      if not found or v_size_quantity < v_reservation.quantity then
        raise exception using message = 'INSUFFICIENT_SIZE_STOCK:' || v_reservation.product_id || ':' || v_reservation.size_key, errcode = 'P0001';
      end if;
      select jsonb_set(
        size_stock,
        array[v_reservation.size_key],
        to_jsonb(v_size_quantity - v_reservation.quantity),
        false
      ) into v_updated_size_stock
      from public.products where id = v_reservation.product_id;

      update public.products
      set size_stock = v_updated_size_stock,
          stock = (
            select coalesce(sum(entry.quantity::integer), 0)::integer
            from jsonb_each_text(v_updated_size_stock) as entry(size_name, quantity)
          ),
          unavailable_sizes = array(
            select entry.size_name
            from jsonb_each_text(v_updated_size_stock) as entry(size_name, quantity)
            where entry.quantity::integer = 0
            order by entry.size_name
          )
      where id = v_reservation.product_id
      returning id into v_updated_product_id;
    else
      update public.products
      set stock = coalesce(stock, 0) - v_reservation.quantity
      where id = v_reservation.product_id
        and coalesce(stock, 0) >= v_reservation.quantity
      returning id into v_updated_product_id;
      if not found then
        raise exception using message = 'INSUFFICIENT_STOCK:' || v_reservation.product_id, errcode = 'P0001';
      end if;
    end if;
  end loop;

  delete from public.stripe_order_stock_reservations where order_id = p_order_id;
  update public.orders
  set status = 'paid',
      stripe_payment_intent_id = p_payment_intent_id,
      stripe_payment_method = left(p_payment_method, 120),
      stripe_paid_at = now(),
      stripe_stock_reserved = false
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'already_paid', false);
end;
$$;

revoke all on function public.set_product_size_stock_with_reservations(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_product_size_stock_with_reservations(bigint, text, jsonb) to service_role;
revoke all on function public.create_stripe_checkout_order(uuid, text, text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.create_stripe_checkout_order(uuid, text, text, text, text, text, jsonb, integer) to service_role;
revoke all on function public.mark_stripe_order_paid(uuid, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.mark_stripe_order_paid(uuid, text, text, text, bigint, text) to service_role;

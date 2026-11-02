do $$
begin
  if exists (
    select 1
    from public.stripe_order_stock_reservations as reservation
    join public.products as product on product.id = reservation.product_id
    where product.product_type = 'shoe'
      and (
        product.size_category is distinct from case
          when product.size_category = 'kids' then 'junior'
          when product.size_category in ('junior', 'womens', 'mens') then product.size_category
          else 'mens'
        end
        or coalesce(product.sizes, '{}'::text[]) is distinct from array(
          select 'EU ' || size_number
          from generate_series(
            case
              when product.size_category in ('junior', 'kids') then 32
              when product.size_category = 'womens' then 35
              else 36
            end,
            case
              when product.size_category in ('junior', 'kids') then 41
              when product.size_category = 'womens' then 45
              else 46
            end
          ) as size_number
          order by size_number
        )
      )
  ) then
    raise exception 'EU shoe-size migration paused: wait for active shoe checkouts to complete or expire, then rerun this migration.';
  end if;

  if exists (
    select 1
    from public.products as product
    join public.order_items as item on item.product_id = product.id
    join public.orders as customer_order on customer_order.id = item.order_id
    where product.product_type = 'shoe'
      and item.size = any(product.sizes)
      and customer_order.status in ('paid', 'processing', 'shipped', 'delivered')
      and customer_order.created_at >= product.zoho_stock_reconciliation_started_at
      and customer_order.zoho_invoice_recorded_at is null
      and (
        product.size_category is distinct from case
          when product.size_category = 'kids' then 'junior'
          when product.size_category in ('junior', 'womens', 'mens') then product.size_category
          else 'mens'
        end
        or coalesce(product.sizes, '{}'::text[]) is distinct from array(
          select 'EU ' || size_number
          from generate_series(
            case
              when product.size_category in ('junior', 'kids') then 32
              when product.size_category = 'womens' then 35
              else 36
            end,
            case
              when product.size_category in ('junior', 'kids') then 41
              when product.size_category = 'womens' then 45
              else 46
            end
          ) as size_number
          order by size_number
        )
      )
  ) then
    raise exception 'EU shoe-size migration paused: create and record Zoho invoices for paid shoe orders that have not yet been recorded, then rerun this migration.';
  end if;
end;
$$;

update public.products as product
set size_category = case
      when product.size_category = 'kids' then 'junior'
      when product.size_category in ('junior', 'womens', 'mens') then product.size_category
      else 'mens'
    end,
    colors = '{}'::text[],
    sizes = (
      select array_agg('EU ' || size_number order by size_number)
      from generate_series(
        case
          when product.size_category in ('junior', 'kids') then 32
          when product.size_category = 'womens' then 35
          else 36
        end,
        case
          when product.size_category in ('junior', 'kids') then 41
          when product.size_category = 'womens' then 45
          else 46
        end
      ) as size_number
    ),
    unavailable_sizes = (
      select array_agg('EU ' || size_number order by size_number)
      from generate_series(
        case
          when product.size_category in ('junior', 'kids') then 32
          when product.size_category = 'womens' then 35
          else 36
        end,
        case
          when product.size_category in ('junior', 'kids') then 41
          when product.size_category = 'womens' then 45
          else 46
        end
      ) as size_number
    ),
    size_stock = (
      select jsonb_object_agg('EU ' || size_number, 0)
      from generate_series(
        case
          when product.size_category in ('junior', 'kids') then 32
          when product.size_category = 'womens' then 35
          else 36
        end,
        case
          when product.size_category in ('junior', 'kids') then 41
          when product.size_category = 'womens' then 45
          else 46
        end
      ) as size_number
    ),
    stock = 0,
    zoho_size_skus = '{}'::jsonb,
    zoho_size_item_ids = '{}'::jsonb,
    zoho_size_stock_synced_at = '{}'::jsonb
where product.product_type = 'shoe'
  and (
    product.size_category is distinct from case
      when product.size_category = 'kids' then 'junior'
      when product.size_category in ('junior', 'womens', 'mens') then product.size_category
      else 'mens'
    end
    or coalesce(product.sizes, '{}'::text[]) is distinct from array(
      select 'EU ' || size_number
      from generate_series(
        case
          when product.size_category in ('junior', 'kids') then 32
          when product.size_category = 'womens' then 35
          else 36
        end,
        case
          when product.size_category in ('junior', 'kids') then 41
          when product.size_category = 'womens' then 45
          else 46
        end
      ) as size_number
      order by size_number
    )
  );

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
    or p_size_category not in ('junior', 'womens', 'mens')
    or jsonb_typeof(p_size_stock) is distinct from 'object' then
    raise exception using message = 'INVALID_SIZE_STOCK', errcode = '22023';
  end if;

  select array_agg('EU ' || size_number order by size_number)
  into v_sizes
  from generate_series(
    case when p_size_category = 'junior' then 32 when p_size_category = 'womens' then 35 else 36 end,
    case when p_size_category = 'junior' then 41 when p_size_category = 'womens' then 45 else 46 end
  ) as size_number;

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

revoke all on function public.set_product_size_stock_with_reservations(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_product_size_stock_with_reservations(bigint, text, jsonb) to service_role;

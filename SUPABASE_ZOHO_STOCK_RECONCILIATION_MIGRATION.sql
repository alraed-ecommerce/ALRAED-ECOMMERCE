alter table public.orders
  add column if not exists zoho_invoice_recorded_at timestamptz;

alter table public.products
  add column if not exists zoho_stock_reconciliation_started_at timestamptz not null default now();

create or replace function public.sync_zoho_product_stock(p_updates jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_update record;
  v_product public.products%rowtype;
  v_external_stock integer;
  v_pending_sales integer;
  v_reserved_stock integer;
  v_updated_count integer := 0;
  v_sync_time timestamptz;
begin
  if jsonb_typeof(p_updates) is distinct from 'array' then
    raise exception using message = 'Inventory updates must be a JSON array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as updates(update_row)
    where jsonb_typeof(update_row) is distinct from 'object'
      or (
        nullif(btrim(update_row->>'zoho_product_id'), '') is null
        and nullif(btrim(update_row->>'sku'), '') is null
      )
      or coalesce(update_row->>'stock', '') !~ '^[0-9]+$'
  ) then
    raise exception using message = 'Every inventory update must have a Zoho item ID or SKU and a non-negative whole-number stock value.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as updates(update_row)
    where nullif(btrim(update_row->>'zoho_product_id'), '') is not null
    group by upper(btrim(update_row->>'zoho_product_id'))
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_updates) as updates(update_row)
    where nullif(btrim(update_row->>'sku'), '') is not null
      and nullif(btrim(update_row->>'zoho_product_id'), '') is null
    group by upper(btrim(update_row->>'sku'))
    having count(*) > 1
  ) then
    raise exception using message = 'Inventory updates contain duplicate Zoho item IDs or SKUs.';
  end if;

  for v_update in
    select product.id, updates.update_row
    from jsonb_array_elements(p_updates) as updates(update_row)
    join public.products as product
      on product.id = coalesce(
        (
          select mapped_product.id
          from public.products as mapped_product
          where nullif(btrim(updates.update_row->>'zoho_product_id'), '') is not null
            and upper(btrim(mapped_product.zoho_product_id)) = upper(btrim(updates.update_row->>'zoho_product_id'))
          order by mapped_product.id
          limit 1
        ),
        (
          select mapped_product.id
          from public.products as mapped_product
          where nullif(btrim(updates.update_row->>'sku'), '') is not null
            and upper(btrim(mapped_product.sku)) = upper(btrim(updates.update_row->>'sku'))
            and (
              nullif(btrim(updates.update_row->>'zoho_product_id'), '') is null
              or mapped_product.zoho_product_id is null
              or btrim(mapped_product.zoho_product_id) = ''
            )
          order by mapped_product.id
          limit 1
        )
      )
    order by product.id
  loop
    select * into v_product
    from public.products
    where id = v_update.id
    for update;

    v_external_stock := (v_update.update_row->>'stock')::integer;

    select coalesce(sum(item.quantity), 0)::integer into v_pending_sales
    from public.orders as customer_order
    join public.order_items as item on item.order_id = customer_order.id
    where item.product_id = v_product.id
      and customer_order.status in ('paid', 'processing', 'shipped', 'delivered')
      and customer_order.created_at >= v_product.zoho_stock_reconciliation_started_at
      and customer_order.zoho_invoice_recorded_at is null;

    if v_external_stock < v_pending_sales then
      raise exception using message = 'ZOHO_STOCK_BELOW_UNRECORDED_PAID_SALES:' || coalesce(v_product.sku, v_product.zoho_product_id, v_product.id::text);
    end if;

    select coalesce(sum(quantity), 0)::integer into v_reserved_stock
    from public.stripe_order_stock_reservations
    where product_id = v_product.id;

    if v_external_stock - v_pending_sales < v_reserved_stock then
      raise exception using message = 'ZOHO_STOCK_BELOW_ACTIVE_CHECKOUT_RESERVATIONS:' || coalesce(v_product.sku, v_product.zoho_product_id, v_product.id::text);
    end if;

    v_sync_time := clock_timestamp();
    update public.products
    set stock = v_external_stock - v_pending_sales,
        zoho_product_id = coalesce(nullif(btrim(v_update.update_row->>'zoho_product_id'), ''), zoho_product_id),
        zoho_stock_synced_at = v_sync_time,
        stripe_sales_synced_at = v_sync_time
    where id = v_product.id;

    v_updated_count := v_updated_count + 1;
  end loop;

  if v_updated_count <> jsonb_array_length(p_updates) then
    raise exception using message = 'One or more Zoho item IDs or SKUs no longer match a website product.';
  end if;

  return v_updated_count;
end;
$$;

revoke all on function public.sync_zoho_product_stock(jsonb) from public, anon, authenticated;
grant execute on function public.sync_zoho_product_stock(jsonb) to service_role;

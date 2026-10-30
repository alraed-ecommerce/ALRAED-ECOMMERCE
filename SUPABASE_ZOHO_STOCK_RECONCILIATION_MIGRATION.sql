alter table public.orders
  add column if not exists zoho_invoice_recorded_at timestamptz;

alter table public.products
  add column if not exists zoho_stock_reconciliation_started_at timestamptz not null default now(),
  add column if not exists zoho_size_skus jsonb not null default '{}'::jsonb,
  add column if not exists zoho_size_item_ids jsonb not null default '{}'::jsonb,
  add column if not exists zoho_size_stock_synced_at jsonb not null default '{}'::jsonb;

alter table public.order_items
  add column if not exists size text;

update public.order_items
set size = (regexp_match(product_name, 'Size: ([^,)]+)'))[1]
where size is null
  and product_name ~ 'Size: [^,)]+';

create or replace function public.set_order_item_size_from_product_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.size := coalesce(
    nullif(btrim(new.size), ''),
    (regexp_match(new.product_name, 'Size: ([^,)]+)'))[1]
  );
  return new;
end;
$$;

drop trigger if exists order_items_set_size_from_product_name on public.order_items;
create trigger order_items_set_size_from_product_name
before insert or update of product_name, size on public.order_items
for each row execute function public.set_order_item_size_from_product_name();

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
  v_size text;
  v_pending_sales integer;
  v_reserved_stock integer;
  v_updated_count integer := 0;
  v_sync_time timestamptz;
  v_updated_size_stock jsonb;
  v_updated_size_sync_times jsonb;
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
      or (
        nullif(btrim(update_row->>'size'), '') is not null
        and coalesce(update_row->>'product_id', '') !~ '^[0-9]+$'
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
          where mapped_product.id = case
            when coalesce(updates.update_row->>'product_id', '') ~ '^[0-9]+$'
              then (updates.update_row->>'product_id')::bigint
            else null
          end
            and (
              nullif(btrim(updates.update_row->>'size'), '') is null
              or (
                mapped_product.product_type = 'shoe'
                and (
                  upper(btrim(mapped_product.zoho_size_skus ->> (updates.update_row->>'size')))
                    = upper(btrim(updates.update_row->>'sku'))
                  or upper(btrim(mapped_product.zoho_size_item_ids ->> (updates.update_row->>'size')))
                    = upper(btrim(updates.update_row->>'zoho_product_id'))
                )
              )
            )
          limit 1
        ),
        (
          select mapped_product.id
          from public.products as mapped_product
          where nullif(btrim(updates.update_row->>'size'), '') is null
            and nullif(btrim(updates.update_row->>'zoho_product_id'), '') is not null
            and upper(btrim(mapped_product.zoho_product_id)) = upper(btrim(updates.update_row->>'zoho_product_id'))
          order by mapped_product.id
          limit 1
        ),
        (
          select mapped_product.id
          from public.products as mapped_product
          where nullif(btrim(updates.update_row->>'size'), '') is null
            and nullif(btrim(updates.update_row->>'sku'), '') is not null
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

    v_size := nullif(btrim(v_update.update_row->>'size'), '');
    if v_size is not null then
      if v_product.product_type <> 'shoe' or not (v_size = any(v_product.sizes)) then
        raise exception using message = 'ZOHO_SIZE_MAPPING_INVALID:' || v_product.id || ':' || v_size;
      end if;

      select coalesce(sum(item.quantity), 0)::integer into v_pending_sales
      from public.orders as customer_order
      join public.order_items as item on item.order_id = customer_order.id
      where item.product_id = v_product.id
        and customer_order.status in ('paid', 'processing', 'shipped', 'delivered')
        and customer_order.created_at >= v_product.zoho_stock_reconciliation_started_at
        and customer_order.zoho_invoice_recorded_at is null
        and item.size = v_size;

      if v_external_stock < v_pending_sales then
        raise exception using message = 'ZOHO_STOCK_BELOW_UNRECORDED_PAID_SALES:' || coalesce(v_product.sku, v_product.zoho_product_id, v_product.id::text) || ':' || v_size;
      end if;

      select coalesce(sum(quantity), 0)::integer into v_reserved_stock
      from public.stripe_order_stock_reservations
      where product_id = v_product.id and size_key = v_size;

      if v_external_stock - v_pending_sales < v_reserved_stock then
        raise exception using message = 'ZOHO_STOCK_BELOW_ACTIVE_CHECKOUT_RESERVATIONS:' || coalesce(v_product.sku, v_product.zoho_product_id, v_product.id::text) || ':' || v_size;
      end if;

      v_sync_time := clock_timestamp();
      v_updated_size_stock := jsonb_set(
        coalesce(v_product.size_stock, '{}'::jsonb),
        array[v_size],
        to_jsonb(v_external_stock - v_pending_sales),
        true
      );
      v_updated_size_sync_times := jsonb_set(
        coalesce(v_product.zoho_size_stock_synced_at, '{}'::jsonb),
        array[v_size],
        to_jsonb(v_sync_time),
        true
      );

      update public.products
      set size_stock = v_updated_size_stock,
          stock = (select coalesce(sum(value::integer), 0)::integer from jsonb_each_text(v_updated_size_stock)),
          unavailable_sizes = array(
            select entry.key
            from jsonb_each_text(v_updated_size_stock) as entry(key, value)
            where entry.value::integer < 1
            order by entry.key
          ),
          zoho_size_item_ids = jsonb_set(
            coalesce(zoho_size_item_ids, '{}'::jsonb),
            array[v_size],
            to_jsonb(v_update.update_row->>'zoho_product_id'),
            true
          ),
          zoho_size_stock_synced_at = v_updated_size_sync_times,
          zoho_stock_synced_at = v_sync_time
      where id = v_product.id;

      v_updated_count := v_updated_count + 1;
      continue;
    end if;

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

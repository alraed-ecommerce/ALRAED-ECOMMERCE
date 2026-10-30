alter table public.products
  add column if not exists sku text,
  add column if not exists zoho_product_id text,
  add column if not exists zoho_stock_synced_at timestamptz,
  add column if not exists zoho_size_skus jsonb not null default '{}'::jsonb,
  add column if not exists zoho_size_item_ids jsonb not null default '{}'::jsonb,
  add column if not exists zoho_size_stock_synced_at jsonb not null default '{}'::jsonb;

create unique index if not exists products_sku_normalized_unique
  on public.products (upper(btrim(sku)))
  where sku is not null and btrim(sku) <> '';

create unique index if not exists products_zoho_product_id_normalized_unique
  on public.products (upper(btrim(zoho_product_id)))
  where zoho_product_id is not null and btrim(zoho_product_id) <> '';

create or replace function public.sync_zoho_product_stock(p_updates jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_count integer;
begin
  if jsonb_typeof(p_updates) is distinct from 'array' then
    raise exception 'Inventory updates must be a JSON array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as updates(update_row)
    where jsonb_typeof(update_row) is distinct from 'object'
      or nullif(btrim(update_row->>'sku'), '') is null
      or coalesce(update_row->>'stock', '') !~ '^[0-9]+$'
  ) then
    raise exception 'Every inventory update must have a SKU and a non-negative whole-number stock value.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as updates(update_row)
    group by upper(btrim(update_row->>'sku'))
    having count(*) > 1
  ) then
    raise exception 'Inventory updates contain duplicate SKUs.';
  end if;

  update public.products as product
  set stock = (update_row->>'stock')::integer,
      zoho_stock_synced_at = now()
  from jsonb_array_elements(p_updates) as updates(update_row)
  where upper(btrim(product.sku)) = upper(btrim(update_row->>'sku'));

  get diagnostics updated_count = row_count;

  if updated_count <> jsonb_array_length(p_updates) then
    raise exception 'One or more Zoho SKUs no longer match a website product.';
  end if;

  return updated_count;
end;
$$;

revoke all on function public.sync_zoho_product_stock(jsonb) from public, anon, authenticated;
grant execute on function public.sync_zoho_product_stock(jsonb) to service_role;

alter table public.products
  add column if not exists image_urls text[] not null default '{}';

update public.products
set image_urls = array[image_url]
where coalesce(image_url, '') <> ''
  and cardinality(image_urls) = 0;

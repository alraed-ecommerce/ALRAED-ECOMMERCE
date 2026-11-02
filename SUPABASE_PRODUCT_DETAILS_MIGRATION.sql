alter table public.products
  add column if not exists description text not null default '',
  add column if not exists specifications jsonb not null default '{}'::jsonb;

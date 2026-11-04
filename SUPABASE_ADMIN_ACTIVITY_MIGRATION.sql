create table if not exists public.admin_activity_log (
  id bigint generated always as identity primary key,
  actor_uid text,
  actor_email text,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_label text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_log_created_at_idx
  on public.admin_activity_log (created_at desc, id desc);
create index if not exists admin_activity_log_entity_idx
  on public.admin_activity_log (entity_type, entity_id, created_at desc);
create index if not exists admin_activity_log_actor_idx
  on public.admin_activity_log (actor_uid, created_at desc);

alter table public.admin_activity_log enable row level security;
revoke all on public.admin_activity_log from public, anon, authenticated, service_role;
grant select, insert on public.admin_activity_log to service_role;
grant usage, select on sequence public.admin_activity_log_id_seq to service_role;

create or replace function public.prevent_admin_activity_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'ADMIN_ACTIVITY_LOG_IS_APPEND_ONLY';
end;
$$;

revoke all on function public.prevent_admin_activity_log_mutation() from public, anon, authenticated, service_role;
drop trigger if exists admin_activity_log_immutable on public.admin_activity_log;
create trigger admin_activity_log_immutable
before update or delete on public.admin_activity_log
for each row execute function public.prevent_admin_activity_log_mutation();

insert into public.admin_activity_log (
  actor_uid,
  actor_email,
  actor_name,
  action,
  entity_type,
  entity_id,
  entity_label,
  details,
  created_at
)
select
  history.changed_by_uid,
  history.changed_by_email,
  coalesce(nullif(history.changed_by_email, ''), 'Automated system'),
  'order.status_changed',
  'order',
  history.order_id::text,
  coalesce(nullif(customer_order.customer_name, ''), 'Order ' || right(history.order_id::text, 8)),
  jsonb_build_object('from', history.previous_status, 'to', history.new_status),
  history.changed_at
from public.order_status_history as history
left join public.orders as customer_order on customer_order.id = history.order_id
where not exists (
  select 1
  from public.admin_activity_log as existing
  where existing.action = 'order.status_changed'
    and existing.entity_id = history.order_id::text
    and existing.created_at = history.changed_at
    and existing.details ->> 'from' = history.previous_status
    and existing.details ->> 'to' = history.new_status
);

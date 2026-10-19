alter table profiles
  add column if not exists addresses jsonb not null default '[]'::jsonb;

drop index if exists profiles_firebase_uid_unique_idx;

create unique index profiles_firebase_uid_unique_idx
  on profiles (firebase_uid);

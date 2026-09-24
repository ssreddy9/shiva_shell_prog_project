-- Dinalekha — database setup for cloud accounts.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once.
--
-- Everything a person writes is encrypted on their device before upload
-- (AES-256-GCM). The server only ever stores ciphertext, so even the project
-- owner cannot read anyone's diary, money or documents.

-- 1. Per-user key material --------------------------------------------------
-- The user's random data key, wrapped (encrypted) twice: once with a key
-- derived from their password, once with their recovery key.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  kdf_salt text not null,
  kdf_iter int not null,
  wrapped_key text not null,
  wrap_iv text not null,
  recovery_salt text not null,
  recovery_wrapped_key text not null,
  recovery_iv text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 2. Encrypted records -------------------------------------------------------
-- One row per item (diary entry, transaction, setting…). `ct` is ciphertext.
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  store text not null,
  key text not null,
  client_updated bigint not null default 0,
  deleted boolean not null default false,
  iv text,
  ct text,
  blob_path text,
  server_updated timestamptz not null default now(),
  primary key (user_id, store, key)
);
create index if not exists records_pull on public.records (user_id, server_updated);
alter table public.records enable row level security;
drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_server_updated() returns trigger
language plpgsql as $$
begin
  new.server_updated = clock_timestamp();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_server_updated();

-- 3. Encrypted photos and document scans ------------------------------------
insert into storage.buckets (id, name, public)
values ('blobs', 'blobs', false)
on conflict (id) do nothing;

drop policy if exists "own blobs select" on storage.objects;
drop policy if exists "own blobs insert" on storage.objects;
drop policy if exists "own blobs update" on storage.objects;
drop policy if exists "own blobs delete" on storage.objects;
create policy "own blobs select" on storage.objects for select
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own blobs insert" on storage.objects for insert
  with check (bucket_id = 'blobs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own blobs update" on storage.objects for update
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own blobs delete" on storage.objects for delete
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Let people delete their own account ------------------------------------
-- (Their files are removed by the app first; rows cascade from auth.users.)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

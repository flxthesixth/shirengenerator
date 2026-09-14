-- SHIREN Generator: owner-scoped projects and private asset storage.
-- Paste this whole file into: Supabase Dashboard → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

create table if not exists public.nft_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  canvas_size jsonb not null default '{"width":512,"height":512}'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  generated_count integer not null default 0 check (generated_count >= 0),
  generated_nfts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade the pre-existing prototype table without retaining rendered PNG data.
alter table public.nft_collections add column if not exists generated_count integer not null default 0;
alter table public.nft_collections add column if not exists updated_at timestamptz not null default now();
alter table public.nft_collections alter column generated_nfts set default '[]'::jsonb;

-- Name uniqueness per user: duplicate saves must fail loudly, never silently merge.
alter table public.nft_collections drop constraint if exists nft_collections_user_id_name_key;
alter table public.nft_collections add constraint nft_collections_user_id_name_key unique (user_id, name);

create index if not exists nft_collections_user_updated_idx
  on public.nft_collections (user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nft_collections_updated_at on public.nft_collections;
create trigger nft_collections_updated_at
before update on public.nft_collections
for each row execute function public.set_updated_at();

alter table public.nft_collections enable row level security;

drop policy if exists "Owners manage collections" on public.nft_collections;
create policy "Owners manage collections"
on public.nft_collections
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Private bucket for trait source images + rendered PNGs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nft-assets',
  'nft-assets',
  false,
  10485760,
  array['image/png', 'image/webp', 'image/jpeg']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners manage nft assets" on storage.objects;
create policy "Owners manage nft assets"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'nft-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'nft-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

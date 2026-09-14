-- Owner-issued access tokens. Plaintext tokens are generated in the owner UI,
-- hashed in the browser, and never stored in Postgres.
create extension if not exists pgcrypto;

create table if not exists public.access_tokens (
  token_hash text primary key,
  plan text not null check (plan in ('trial', 'pro')),
  max_generations integer not null default 0 check (max_generations >= 0),
  duration_days integer not null check (duration_days > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  is_revoked boolean not null default false
);

create table if not exists public.access_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null references public.access_tokens (token_hash) on delete cascade,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_generations integer not null default 0 check (used_generations >= 0),
  is_active boolean not null default true,
  unique (user_id, token_hash),
  check (expires_at > activated_at)
);

create index if not exists access_activations_user_idx
  on public.access_activations (user_id)
  where is_active = true;

alter table public.access_tokens enable row level security;
alter table public.access_activations enable row level security;

-- No direct client table access. Security-definer RPCs below perform every
-- operation atomically and expose only the caller's own license metadata.
revoke all on public.access_tokens from anon, authenticated;
revoke all on public.access_activations from anon, authenticated;

create or replace function public.access_status()
returns table (plan text, expires_at timestamptz, used_generations integer, max_generations integer)
language sql security definer set search_path = public
as $$
  select t.plan, a.expires_at, a.used_generations, t.max_generations
  from public.access_activations a
  join public.access_tokens t on t.token_hash = a.token_hash
  where a.user_id = auth.uid()
    and a.is_active = true
    and a.expires_at > now()
    and t.is_revoked = false
  order by a.expires_at desc
  limit 1;
$$;

create or replace function public.activate_access_token(p_token_hash text)
returns table (plan text, expires_at timestamptz, used_generations integer, max_generations integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_token public.access_tokens;
  v_existing public.access_activations;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_token from public.access_tokens
    where token_hash = p_token_hash and is_revoked = false;
  if not found then raise exception 'TOKEN_INVALID'; end if;

  select * into v_existing from public.access_activations
    where user_id = auth.uid() and is_active = true and expires_at > now()
    order by expires_at desc limit 1;
  if found then
    return query select t.plan, v_existing.expires_at, v_existing.used_generations, t.max_generations
      from public.access_tokens t where t.token_hash = v_existing.token_hash;
    return;
  end if;

  update public.access_activations set is_active = false
    where user_id = auth.uid() and is_active = true;
  insert into public.access_activations (user_id, token_hash, expires_at)
    values (auth.uid(), v_token.token_hash, now() + make_interval(days => v_token.duration_days));
  return query select v_token.plan, now() + make_interval(days => v_token.duration_days), 0, v_token.max_generations;
end;
$$;

create or replace function public.consume_generations(p_count integer)
returns table (plan text, expires_at timestamptz, used_generations integer, max_generations integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_access record;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_count < 1 or p_count > 1000 then raise exception 'INVALID_COUNT'; end if;

  select a.id, a.used_generations, t.plan, t.max_generations, a.expires_at
    into v_access
    from public.access_activations a join public.access_tokens t on t.token_hash = a.token_hash
    where a.user_id = auth.uid() and a.is_active = true and a.expires_at > now() and not t.is_revoked
    order by a.expires_at desc limit 1 for update;
  if not found then raise exception 'ACCESS_REQUIRED'; end if;
  if v_access.max_generations > 0 and v_access.used_generations + p_count > v_access.max_generations then
    raise exception 'GENERATION_LIMIT_REACHED';
  end if;

  update public.access_activations set used_generations = used_generations + p_count where id = v_access.id;
  return query select v_access.plan, v_access.expires_at, v_access.used_generations + p_count, v_access.max_generations;
end;
$$;

create or replace function public.create_access_token(p_token_hash text, p_plan text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'flxthe6th@gmail.com' then
    raise exception 'OWNER_ONLY';
  end if;
  if p_plan not in ('trial', 'pro') then raise exception 'INVALID_PLAN'; end if;
  if length(p_token_hash) <> 64 or p_token_hash !~ '^[0-9a-f]+$' then raise exception 'INVALID_TOKEN'; end if;
  insert into public.access_tokens (token_hash, plan, max_generations, duration_days, created_by)
  values (p_token_hash, p_plan, case when p_plan = 'trial' then 2000 else 0 end, 30, auth.uid());
end;
$$;

revoke all on function public.access_status() from public;
revoke all on function public.activate_access_token(text) from public;
revoke all on function public.consume_generations(integer) from public;
revoke all on function public.create_access_token(text, text) from public;
grant execute on function public.access_status() to authenticated;
grant execute on function public.activate_access_token(text) to authenticated;
grant execute on function public.consume_generations(integer) to authenticated;
grant execute on function public.create_access_token(text, text) to authenticated;

-- Fix PL/pgSQL output-column ambiguity in activate_access_token().
-- Safe to run after 20260914_002_access_tokens.sql.
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

  -- Qualify every activation column: output column names are PL/pgSQL variables.
  select a.* into v_existing from public.access_activations a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.expires_at > now()
    order by a.expires_at desc
    limit 1;
  if found then
    return query
      select t.plan, v_existing.expires_at, v_existing.used_generations, t.max_generations
      from public.access_tokens t
      where t.token_hash = v_existing.token_hash;
    return;
  end if;

  update public.access_activations a
    set is_active = false
    where a.user_id = auth.uid() and a.is_active = true;

  insert into public.access_activations (user_id, token_hash, expires_at)
    values (auth.uid(), v_token.token_hash, now() + make_interval(days => v_token.duration_days));

  return query
    select v_token.plan, now() + make_interval(days => v_token.duration_days), 0, v_token.max_generations;
end;
$$;

grant execute on function public.activate_access_token(text) to authenticated;

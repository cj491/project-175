-- PROJECT 175 — Apple Health steps via an iPhone Shortcut.
--
-- The app creates a random personal key and stores only its SHA-256 hash here.
-- The ingest-steps function looks the hash up and writes that user's daily
-- step total into public.records.

create table if not exists public.step_keys (
  key_hash     text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  last_steps   integer
);

alter table public.step_keys enable row level security;
drop policy if exists "own step keys" on public.step_keys;
create policy "own step keys" on public.step_keys for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.step_keys from anon;
grant select, insert, delete on public.step_keys to authenticated;
grant select, update on public.step_keys to service_role;
grant select, insert, update on public.records to service_role;

-- Server-side writes (service role) have no auth.uid(); keep the user_id they set.
create or replace function public.records_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.user_id := coalesce(auth.uid(), new.user_id);
  if tg_op = 'UPDATE' and old.table_name = 'xp' and not new.deleted and not old.deleted
     and (old.data ->> 'amount') is distinct from (new.data ->> 'amount') then
    raise exception 'XP events cannot be modified';
  end if;
  return new;
end $$;

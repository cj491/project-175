-- PROJECT 175 — cloud sync schema
-- Run in the Supabase SQL editor (or `supabase db push`).
--
-- Every local IndexedDB record is stored as one row. Row Level Security makes
-- each user's rows visible and writable only by that user.

create table if not exists public.records (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  table_name  text        not null check (table_name in (
                'profile','targets','foods','savedMeals','foodEntries','water','templates','sessions',
                'steps','walks','weights','measurements','checkins','xp','achievements')),
  record_id   text        not null check (length(record_id) between 1 and 200),
  data        jsonb,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now(),
  -- One row per record per user. For XP this is the anti-duplicate guarantee:
  -- an event id like "meal:breakfast:2026-11-03" can exist only once.
  primary key (user_id, table_name, record_id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

-- Server clock decides updated_at, so "pull everything newer than X" is reliable across devices.
create or replace function public.records_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.user_id := auth.uid();
  -- Earned XP is immutable: it can be deleted (account wipe) but never re-valued.
  if tg_op = 'UPDATE' and old.table_name = 'xp' and not new.deleted and not old.deleted
     and (old.data ->> 'amount') is distinct from (new.data ->> 'amount') then
    raise exception 'XP events cannot be modified';
  end if;
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

alter table public.records enable row level security;

drop policy if exists "own records - select" on public.records;
drop policy if exists "own records - insert" on public.records;
drop policy if exists "own records - update" on public.records;
drop policy if exists "own records - delete" on public.records;
create policy "own records - select" on public.records for select to authenticated using (user_id = auth.uid());
create policy "own records - insert" on public.records for insert to authenticated with check (user_id = auth.uid());
create policy "own records - update" on public.records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own records - delete" on public.records for delete to authenticated using (user_id = auth.uid());

-- Explicit API access (works whether or not "Automatically expose new tables" is on).
-- Only signed-in users get access, and RLS above limits them to their own rows.
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- ───────────────────────── Background reminders (web push) ─────────────────────────

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Written only by the send-reminders edge function (service role); prevents repeats.
create table if not exists public.reminder_log (
  user_id     uuid not null references auth.users (id) on delete cascade,
  reminder_id text not null,
  local_date  date not null,
  sent_at     timestamptz not null default now(),
  primary key (user_id, reminder_id, local_date)
);
alter table public.reminder_log enable row level security;
-- No policies or grants: clients can't read or write it.
revoke all on public.reminder_log from anon, authenticated;

-- PROJECT 175 — schedule background reminders every 5 minutes.
-- The function URL and shared secret are read from Supabase Vault
-- (created by scripts/setup-supabase.sh), so no secret lives in this file.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobname) from cron.job where jobname in ('p175-send-reminders', 'p175-reminder-log-cleanup');

select cron.schedule(
  'p175-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'p175_reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'p175_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Housekeeping: keep 30 days of reminder history.
select cron.schedule('p175-reminder-log-cleanup', '17 3 * * *', $$ delete from public.reminder_log where local_date < current_date - 30 $$);

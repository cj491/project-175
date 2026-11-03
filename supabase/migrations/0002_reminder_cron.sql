-- PROJECT 175 — schedule background reminders every 5 minutes.
-- Before running: enable the pg_cron and pg_net extensions (Database → Extensions),
-- deploy the send-reminders function, and replace the two placeholders below.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('p175-send-reminders') where exists (select 1 from cron.job where jobname = 'p175-send-reminders');

select cron.schedule(
  'p175-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- Housekeeping: keep 30 days of reminder history.
select cron.schedule('p175-reminder-log-cleanup', '17 3 * * *', $$ delete from public.reminder_log where local_date < current_date - 30 $$);

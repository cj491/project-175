#!/bin/sh
# One-time Supabase setup for PROJECT 175. Run from anywhere:
#   sh scripts/setup-supabase.sh <project-ref> <app-url>
# Requires `supabase login` first. Prints no secrets.
set -eu

REF="${1:?project ref required}"
APP_URL="${2:?app url required}"
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/node/bin:$PATH"
export SUPABASE_YES=1
SB="npx --yes supabase@latest"

env_get() { grep "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d '"'; }

echo "1/6 Saving the public API key to .env.local"
$SB projects api-keys --remote="$REF" -o json | python3 scripts/pick-public-key.py .env.local "$REF"

echo "2/6 Creating tables and security rules"
$SB db query --remote="$REF" -f supabase/migrations/0001_project175.sql > /dev/null

echo "3/6 Storing the reminder schedule secret in Vault"
CRON_SECRET=$(openssl rand -hex 24)
$SB db query --remote="$REF" "delete from vault.secrets where name in ('p175_cron_secret','p175_reminders_url'); select vault.create_secret('$CRON_SECRET', 'p175_cron_secret'); select vault.create_secret('https://$REF.supabase.co/functions/v1/send-reminders', 'p175_reminders_url');" > /dev/null

echo "4/6 Setting function secrets"
$SB secrets set --remote="$REF" \
  "VAPID_PUBLIC_KEY=$(env_get NEXT_PUBLIC_VAPID_PUBLIC_KEY)" \
  "VAPID_PRIVATE_KEY=$(env_get VAPID_PRIVATE_KEY)" \
  "VAPID_SUBJECT=$APP_URL" \
  "CRON_SECRET=$CRON_SECRET" > /dev/null

echo "5/6 Deploying the send-reminders function"
$SB functions deploy send-reminders --remote="$REF" --no-verify-jwt --use-api

echo "6/6 Scheduling reminders every 5 minutes"
$SB db query --remote="$REF" -f supabase/migrations/0002_reminder_cron.sql > /dev/null

echo ""
echo "Done. Supabase is ready for PROJECT 175."

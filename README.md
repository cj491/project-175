# PROJECT 175

A gamified, local-first personal fitness operating system: nutrition, training, walking, body progress, XP, streaks and achievements in one app. Mobile-first, dark, installable as a PWA.

## Run it

Requires Node.js 20+ (this machine has Node 22 at `~/.local/node/bin`).

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # only needed on this Mac
cd project-175
npm install
npm run dev          # http://localhost:3000
npm test             # 35 unit/integration tests
```

Production: `npm run build && npm start`.

## Configuration (`.env.local`, all optional)

| Variable | Used for | Where |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Accounts + cloud sync | Browser (anon key is public by design; RLS protects data) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Background reminders | Browser (already generated) |
| `VAPID_PRIVATE_KEY` | Background reminders | **Supabase function secret only** — not read by the app |
| `USDA_API_KEY` | Extra food search source | Server only (`/api/foods/search`) |
| `CAP_SERVER_URL`, `NEXT_PUBLIC_API_BASE` | Native app shell | Capacitor build |

Without any of these the app runs fully local, and food search uses Open Food Facts (no key needed).

## Turning on cloud sync (Supabase)

1. Create a project at supabase.com. In **SQL editor**, run `supabase/migrations/0001_project175.sql`.
2. Put the project URL and anon key in `.env.local`, restart `npm run dev`.
3. Profile → **Cloud backup & sync** → create an account. Existing local data is merged into it.
4. Under Authentication → URL configuration, add your site URL (for email confirmation and password reset links).

How it works: every local change marks that record dirty; the sync engine pushes dirty records to one `records` table, then pulls rows changed since the last sync (`src/lib/sync/engine.ts`). Row Level Security restricts every row to its owner, and the primary key `(user, table, id)` keeps each XP event unique across devices. Progress photos never leave the device.

## Turning on background reminders

Needs cloud sync first.

1. Install the Supabase CLI, then: `supabase functions deploy send-reminders --no-verify-jwt`
2. `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=<random>` (keys are in `.env.local`)
3. Enable `pg_cron` and `pg_net`, fill in the two placeholders in `supabase/migrations/0002_reminder_cron.sql`, and run it.
4. Profile → Reminders → **Background reminders**. On iPhone, add the app to the Home Screen first (Safari only allows web push for installed apps).

The function runs every 5 minutes, uses each device's time zone, skips reminders that no longer apply (protein already hit, workout done…), and sends each at most once a day.

## Native app (Apple Health / Health Connect)

`ios/` and `android/` are Capacitor projects with the `capacitor-health` plugin, HealthKit entitlement + usage text, and Health Connect step permission already configured. The native shell loads your deployed web app.

1. Deploy the web app (e.g. Vercel). Set `CAP_SERVER_URL=https://your-app…` then `npx cap sync`.
2. iOS: install Xcode, `npm run cap:ios`, pick your team under Signing & Capabilities (HealthKit is already listed), run on your iPhone.
3. Android: install Android Studio, `npm run cap:android`. The phone needs the Health Connect app.
4. In the app: Activity → Connected devices → **Connect**. It imports 30 days of steps, then the last week on every launch. A day you entered manually is only replaced when the device counted more.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Radix Dialog + shadcn-style components (hand-written in `src/components/ui`) · Lucide icons · Recharts · Zod · Dexie (IndexedDB) · Motion.

## Architecture

```
src/
  app/                    Routes (Home, Nutrition, Training, Training/Session, Activity, Progress, Profile) + manifest
  components/
    ui/                   Design-system primitives (Button, Card, Sheet, ProgressRing, inputs…)
    shell/                App shell, navigation, onboarding, reminders, service-worker registration
    providers/            Live data provider (Dexie live queries) and UI/sheet controller
    logging/              Fast-log sheets: food logger, water, steps, walk, weight, check-in
    gamification/         Rewards engine, missions card, toasts, celebration overlays
    home/ nutrition/ training/ activity/ progress/ profile/   Feature screens
    charts/               Shared Recharts wrappers
  app/api/foods/          Food search + barcode lookup routes (keep API keys server-side)
  lib/
    types.ts              Domain model (all records have ids + timestamps → sync-ready)
    db/                   Dexie schema, defaults/seed, repository (the only write path)
    domain/               Nutrition, workout/progressive overload, activity, analytics
    gamification/         XP rules, levels, streaks (with shields), missions, achievements
    integrations/         Food search client, Apple Health / Health Connect provider
    server/               Server-only food database adapters (Open Food Facts, USDA)
    sync/                 Supabase client, change tracking, sync engine, web push
    validation.ts         Zod schemas for every form + backup import
```

Key decisions:

- **Local-first.** No Supabase credentials were available, so data lives in IndexedDB. UI never talks to storage directly — everything goes through `lib/db/repo.ts`, so a Supabase/cloud sync layer can be added behind it.
- **XP can't be double-claimed.** Each reward has a deterministic id (e.g. `meal:breakfast:2026-11-03`) used as the IndexedDB primary key. A duplicate insert is rejected by the database itself. Deleting and re-logging a meal does not re-award XP.
- **Targets are versioned.** Changing a goal creates a new version effective from that day; history is always judged against the target in effect at the time.
- **Estimates are labeled.** Calorie targets, walking distance and body-fat figures carry an "est." tag. Body fat is never inferred from photos. No device is ever shown as connected.

## Development checklist

- [x] Environment, Next.js project, design tokens, navigation (mobile bottom bar + FAB, desktop sidebar)
- [x] IndexedDB persistence, prefilled profile and targets, onboarding
- [x] Home dashboard: transformation overview, calorie ring, macros, activity rings, today's plan, coach messages, streaks
- [x] Nutrition: meal categories, library search, favourites, frequent foods, custom foods, manual entry, multi-item meals, saved meals, copy yesterday's meal, edit/delete, date history, water
- [x] Training: editable weekly schedule and templates (A/B/C/Bonus/custom), live workout player, rest timer, skip/replace/add exercises, completion %, progressive overload, PRs, history
- [x] Activity: manual steps, editable step goal, walk quick-adds (10/20/30/custom), estimated distance, 7/30-day charts, history, health-integration layer
- [x] Progress: weight + 7-day average, calories, protein, weekly workouts, steps, strength progression, measurements, private photos with slider comparison, weekly check-ins with observations
- [x] Gamification: XP, 14 levels, 4 streak types with streak shields, 16 achievements, adaptive daily missions, celebrations
- [x] Reminders (in-app + system notifications while open), data export/import/reset
- [x] PWA manifest, icons, offline service worker (production builds)
- [x] Validation pass: flows tested in-browser, refresh persistence, XP duplication, macro maths, workout history, charts, clean console

- [x] Automated tests (Vitest): XP, levels, streaks, missions, overload, PRs, nutrition maths, repository, sync engine, reminder rules, food mapping
- [x] Food database search (Open Food Facts; USDA optional) and barcode scanning, saved to the local library for offline reuse
- [x] Supabase accounts + two-way cloud sync (built and tested against a simulated backend; needs your project keys for a live test)
- [x] Background reminders via web push + Supabase Edge Function (needs deployment)
- [x] Capacitor iOS/Android projects with Apple Health / Health Connect step sync (needs Xcode / Android Studio to build)

## Still requires your accounts or tools

- Supabase project keys (sync, accounts, background reminders)
- Xcode + Apple Developer account for the iOS app (HealthKit requires signing); Android Studio for Android
- A deployed URL for the native shell

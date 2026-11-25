# Handoff — Issue #29 Google Calendar

## Current status
Implementation is on `feat/29-google-calendar-sync`, based on `main` SHA `67bb5717b2efdf692659bdda17c48e1b0315cacb`. Not merged, no PR opened yet. No remote database migration or deployment performed.

## Scope / privacy
One-way Marcou -> Google Calendar. Confirmed bookings enqueue an upsert; cancelled/expired bookings enqueue deletion. Rescheduling/reverse sync are out of scope. Event payload includes only service snapshot, start/end and provider IANA timezone; no customer name, phone, email, or booking UUID.

## Files
- `docs/CALENDAR-INTEGRATION.md`
- `supabase/migrations/20261125153000_google_calendar_sync.sql`
- `src/server/calendar/{admin,crypto,google,oauth}.ts`
- `src/app/api/calendar/{connect,callback,status,disconnect,worker}/route.ts`
- `src/app/painel/integracoes/calendario/page.tsx` and disconnect form
- `src/server/calendar/crypto.test.ts`
- `.env.example`, `README.md`, `src/app/painel/page.tsx`

## Required environment (server-side only)
`GOOGLE_CALENDAR_ENABLED=false` (default; set true only after configuration)
`GOOGLE_CALENDAR_CLIENT_ID`
`GOOGLE_CALENDAR_CLIENT_SECRET`
`GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` (32-byte base64 key)
`GOOGLE_CALENDAR_WORKER_SECRET` (strong random secret)
`SUPABASE_SERVICE_ROLE_KEY`
`NEXT_PUBLIC_SITE_URL` (OAuth redirect origin)

Google OAuth redirect URI: `<NEXT_PUBLIC_SITE_URL>/api/calendar/callback`.
Requested scope: `https://www.googleapis.com/auth/calendar.events`.

## Scheduler
PR #38 is still open and its route is proposed, not deployed or scheduled. Do not create a duplicate cron. Configure an external scheduler to POST `/api/calendar/worker` with `Authorization: Bearer <GOOGLE_CALENDAR_WORKER_SECRET>` only after environment and migration are configured.

## Validation status
Local Git clone/test attempts failed because this execution environment could not resolve github.com. No lint, typecheck, unit tests, DB tests, build, OAuth real flow, Google API, scheduler, or deployment validation has been run here. CI must be observed before opening a draft PR.

## Safety
No secrets, production settings, remote migrations, deploys, or other agents' branches/PRs were changed. The Calendar migration is additive and still unapplied.

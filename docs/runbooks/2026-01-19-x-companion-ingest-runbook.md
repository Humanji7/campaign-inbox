# X Companion (Bird) → Supabase Ingest Runbook — 2026-01-19

Goal: ingest X activity during **active hours US/Eastern (08:00–22:00)** into `unified_events`, so the Cockpit UI can show fresh opportunities without paying the official X API.

This is **MVP**: local companion runs on your machine and pushes normalized events to a Supabase Edge Function (`ingest-events`).

## 0) Prereqs

- You created an X List with your targets (≤ 20).
- You installed Bird and authenticated it via cookies.

Bird docs: `bird list-timeline <listIdOrUrl> --json` and `bird mentions --json`.
Bird docs:
```text
https://bird.fast
https://github.com/steipete/bird
```

## 1) Apply DB migration

Run:
```bash
supabase db push
```

This creates:
- `public.targets`
- `public.unified_events`

## 2) Deploy Edge Function

Deploy:
```bash
npm run deploy:ingest-events
```

Equivalent:
```bash
supabase functions deploy ingest-events --project-ref <ref> --no-verify-jwt
```

## 3) Set Supabase secrets (remote)

You need these secrets for `ingest-events`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INGEST_SECRET` (random string)
- `INGEST_USER_ID` (your Supabase `auth.users.id`)

Example:
```bash
supabase secrets set --project-ref <ref> \
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  INGEST_SECRET=... \
  INGEST_USER_ID=...
```

## 4) Configure local companion

In `.env` (local):
- `X_LIST_ID_OR_URL=https://x.com/i/lists/<id>`
- `INGEST_SECRET=...` (same as Supabase secret)

## 5) Run once (smoke test)

```bash
npm run x:companion:once
```

If you’re outside the active hours window, run:
```bash
FORCE=1 npm run x:companion:once
```

Then open the app → **Cockpit** and click **Refresh**.

## 6) Troubleshooting

- Companion says “outside active hours” → use `FORCE=1`.
- `bird list-timeline` fails → re-auth Bird (cookies expired) or verify list URL/id.
- `ingest failed 401` → mismatch `INGEST_SECRET` local vs Supabase secret.
- Cockpit shows nothing but ingest succeeded → check RLS (should be OK) and that you’re logged in as the same Supabase user as `INGEST_USER_ID`.

# Telegram User Companion (MTProto) → Supabase Ingest — 2026-01-19

Goal: monitor your real Telegram groups/channels (where you can’t add a bot) and surface “where to write now” inside the Cockpit.

This companion runs locally, logs in as **your Telegram user** (MTProto), reads selected chats, and pushes filtered messages into `unified_events` via the `ingest-events` Edge Function.

## 0) Requirements

- You have `INGEST_SECRET` set locally (same value as Supabase secret).
- You have `VITE_SUPABASE_URL` set locally.
- You can obtain Telegram API credentials:
  - Go to `https://my.telegram.org`
  - “API development tools” → get `api_id` and `api_hash`

## 1) Local `.env`

Set:
- `TELEGRAM_API_ID=...`
- `TELEGRAM_API_HASH=...`
- `TELEGRAM_PHONE=...` (optional; you can enter interactively)

## 2) One-time login + generate watch config

Run:
```bash
npm run tg:user:setup
```

It will:
- ask for phone + code (+ 2FA password if enabled)
- write `.tg-user.session`
- create `.tg-user-watch.json` (if missing)
- print top dialogs with chat ids

## 3) Choose chats to monitor

Edit `.tg-user-watch.json`:

- `watchChatIds`: array of numeric ids printed by setup
- `triggers`: filters (default includes links + questions)
- `maxPerChat`: how many recent messages to scan per chat

## 4) Run once

```bash
npm run tg:user:once
```

It writes offsets to `.tg-user-offset.json` (gitignored) to avoid re-ingesting old messages.

## 5) What gets ingested

By default (KISS MVP): messages that are **questions** or **contain links**, per watched chat.

## 6) Troubleshooting

- “missing .tg-user.session” → run `npm run tg:user:setup`
- “no matching messages” → set `triggers.includeAll=true` temporarily
- “ingest 401” → mismatch `INGEST_SECRET` local vs Supabase secret


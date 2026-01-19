# Telegram Companion (link-drop inbox) → Supabase Ingest — 2026-01-19

Goal: use Telegram as a cheap “inbox” to collect links + notes from anywhere (including Twitter/X, Reddit, etc.), then surface them inside the Cockpit as opportunities.

This companion runs locally and pushes messages into `unified_events` via the `ingest-events` Edge Function.

## 1) Create a bot

- Open Telegram and talk to `@BotFather`
- Create a new bot, copy the token

## 2) Get your chat id

Simplest: send any message to your new bot, then run:
```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
```

Find `message.chat.id` for your chat and set it as `TELEGRAM_CHAT_ID`.

## 3) Local `.env`

Set:
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_CHAT_ID=...`
- `INGEST_SECRET=...` (same as Supabase secret used by `ingest-events`)
- `VITE_SUPABASE_URL=...`

## 4) Run once

```bash
npm run tg:companion:once
```

It stores offset in `.tg-companion-offset.json` (gitignored).

## 5) How to use day-to-day

- Forward a message containing an `https://...` link to your bot (or paste the link).
- Run the companion (or later we can schedule it).
- Open Cockpit and handle the item from the queue.


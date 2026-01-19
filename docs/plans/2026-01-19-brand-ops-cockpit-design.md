# Brand Ops Cockpit (Pivot) — Design v0

**Date:** 2026-01-19  
**Owner:** solo founder  
**Scope:** MVP direction + operating mode decisions (KISS)

## Why this pivot

“Tweet generator from commits” is easy to replicate (bot/skill can do it). What has durable value is a **professional control panel**: one place to *see what’s happening*, *decide what to do next*, and *track outcomes* across platforms — with a “smart engine” that aggregates signals and turns them into actionable opportunities.

**MVP rule:** no autoposting/scheduling. We output **deep links** to do the action natively on the platform.

## MVP objective (KPI simplifier)

**Goal:** `P=2` meaningful interactions / week.  
**Meaningful interaction:** reply from a person in the target list.  
This KPI is a simplifier for build speed. The long-term product is a “second brain” with deeper analytics and memory.

## Operating mode (KISS)

- **Mode:** `pull` (user opens cockpit and acts; no push/notifications in MVP).
- **Target list size:** `≤ 20` people (hard cap for MVP).
- **Active hours:** **US/Eastern**, `08:00–22:00`.
- **Freshness SLA inside active hours:** **every 5–10 minutes** (default: 10m), plus **manual “Refresh now”** in UI.

Rationale: “daily digest” loses opportunities; “24/7” increases infra cost + connector brittleness. Active hours gives most of the value.

## Core product primitives (keep strict)

1) **Targets** — who we track and why.
2) **Events** — raw, timestamped facts from platforms.
3) **Opportunities** — derived candidates for action (reply, join thread, comment).
4) **Actions/Outcomes** — what user did + did it move KPI (reply from target?).

Everything else is optional.

### Minimal data contract (normalized event)

We want a stable internal schema even if platform adapters change.

`unified_events` (conceptual):
- `id` (uuid)
- `source` (`github|x|telegram|reddit|manual`)
- `type` (e.g. `commit`, `post`, `reply`, `mention`, `dm`, `comment`)
- `occurred_at` (timestamptz)
- `actor_handle` / `actor_id` (nullable)
- `target_handle` / `target_id` (nullable)
- `url` (canonical deep link)
- `external_id` (source-native id)
- `payload` (jsonb raw; redacted)
- `dedupe_key` (hash of `source+type+external_id`)

## Connectors (MVP approach)

Each connector writes **events** only. Derivations happen later.

### GitHub (already working)
- Source: commits from selected public repos.
- Use: “build-in-public” signals; also to keep the cockpit feeling “alive”.

### X/Twitter (no official API in MVP)
- Adapter approach: **Bird** (non-official CLI) treated as **replaceable**.
- MVP ingestion: **local companion** runs Bird during active hours and pushes normalized events to backend (or exports JSON for import).
- Risk: brittleness/ToS. Mitigation: strict adapter boundary + fast replacement path.

### Telegram (MVP)
- Pragmatic ingest: forward messages/links to a bot or “dropbox channel”, normalize into events.
- Focus: capture threads/opportunities you care about, not full firehose.

### Reddit (MVP)
- Pragmatic ingest: saved posts/comments + subreddit feeds where possible.
- Treat as best-effort; normalize links + minimal text.

## Cockpit UX (MVP)

Not a read-only dashboard. It’s a “board” that supports decisions.

Widgets (fixed, no custom layouts yet):
1) **Opportunities (Now)**: top 10 with deep links + “Why this matters”.
2) **Targets**: last activity + “next action suggestion”.
3) **Weekly score**: progress toward `P=2`.
4) **Imports status**: last sync time, errors, “Refresh now”.

## LLM usage (optional but helpful)

LLM is not the product; it’s a cheap “glue layer”:
- Stage A (cheap/fast): extract facts, classify event type, detect “opportunity”.
- Stage B: render 2–4 short draft replies in **RU for reading + EN for copying** (as we already do for cards).

LLM must degrade gracefully:
- If no key / model fails → still produce opportunities from heuristics (links + short summary).

## Deployment modes (post-MVP question answered)

If a connector needs “always-on” runtime (Bird / scraping):
- **MVP:** local companion during active hours (cheap, controllable).
- **Later:** move to a server/worker when ROI is proven and terms/risks are acceptable.

We can’t get “objective 24/7 truth” without some always-on runtime or paid APIs; MVP chooses “high-value hours”.

## Nearest milestone (next)

**M1: Control Plane skeleton**
- Add `targets` + `unified_events` tables (minimal).
- Add “Imports” pipeline stub: accept event batches from local companion.
- Add Cockpit screen with fixed widgets reading from DB.
- Add weekly score tracking for `P=2`.

## Pre-flight checklist (before building M1)

- Decide exact active hours: `08:00–22:00 US/Eastern` (locked).
- Decide target list format: handles + notes + platform(s) per target.
- Decide “opportunity” definition v0 (reply/comment/quote?).
- Decide local companion transport: push (HTTP) vs export/import.


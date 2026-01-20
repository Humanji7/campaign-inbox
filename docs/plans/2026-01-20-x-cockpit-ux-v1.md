# X Cockpit UX v1 (Speed-First)

**Date:** 2026-01-20  
**Scope:** Cockpit screen for **X only** (Telegram ignored)  
**Goal:** Reduce friction to hit **P=2 meaningful replies/week**.

## Mental model

The Cockpit is a **queue** of “reply opportunities” with one job:

1) pick the next best thread  
2) open it on X  
3) draft a reply  
4) copy/paste and reply manually  
5) mark outcome

Everything else is secondary and should not compete with the next action.

## States (per opportunity)

We treat each item as a tiny workflow:

- `new` → not triaged
- `drafting` → has partial draft
- `ready` → has a usable draft (copyable)
- `done` → replied / closed out
- `ignored` → intentionally skipped

Signals:
- `opened` (last_opened_at)
- `copied` (last_copied_at)
- `got_reply` (outcome flag)

## Primary actions

Ordered by speed/value:

1) **Copy & Open** (when there’s a draft + deep link)  
2) Save draft (persist work-in-progress)  
3) Done / Ignore (triage)  
4) Got reply toggle (weekly KPI)

## Information hierarchy

Left list (fast scan):
- who (`@handle`)
- when (timestamp)
- what (1-line text)
- why (lightweight hint)
- minimal tags (mention / stage)

Right detail (do the work):
- Context (full text + why)
- Draft editor + primary CTA
- Outcome controls

## Priorities

**P0 (this week, speed):**
- X-only UI (remove TG lanes/labels/empty-state commands)
- Reduce visual noise in list/detail (hide score unless debugging)
- Add a single fast path CTA (**Copy & Open**) to match the manual reply flow

**P1 (next):**
- Debounced autosave while typing (avoid losing drafts on selection change)
- “Next action” hint per stage (e.g. “Open thread”, “Write draft”, “Copy reply”)
- Better empty state: one-click “Run companion” (if feasible) + guidance

**P2 (later):**
- Keyboard-first “process next” flow (n → open, c → copy, d → done)
- Batch/metrics view for weekly learning (what kinds of opportunities convert)


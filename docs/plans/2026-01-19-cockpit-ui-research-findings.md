# Cockpit UI Research — Findings → Cockpit v2 Spec

**Date:** 2026-01-19  
**Mode:** dense pro tool (desktop + mobile parity)  
**Primary loop:** triage → open thread → act → mark outcome (`P=2/week`)

## Sources (quick)

```text
X Pro (TweetDeck): columns + shortcuts
https://help.x.com/en/using-x/x-pro

Superhuman: inbox triage philosophy (speed + shortcuts)
https://superhuman.com/blog/inbox-zero

Buffer: engagement/triage angle for social workflows
https://buffer.com/library/engagement/
```

## What works (patterns to copy)

### 1) “Work queue”, not “feed”

Winning UIs treat items as a queue with explicit state:
- **New → Done / Snooze / Ignore**
- fast scan (dense list), detail on demand
- keyboard shortcuts matter when you do this daily

### 2) Master–detail for desktop

Dense triage lives best as:
- left: list (ranked)
- right: detail + actions

This avoids “open/close modal” fatigue and reduces context switching.

### 3) Bottom sheet for mobile

On mobile, detail should be a bottom sheet:
- list stays visible behind
- 1 thumb actions at bottom
- easy dismiss

### 4) Built-in system for “state”

Users need confidence:
- “I already handled this” (Done)
- “Not useful” (Ignore)
- “This moved my KPI” (Got reply)

This is the difference between “cool data” and “usable system”.

## Cockpit v2 layout (spec)

### Desktop (≥ md)

Grid: `420px / rest` (left list / right detail)

Left column:
- Weekly target card (`0/2`)
- Filters row (New-only toggle, Include mentions toggle, Age window)
- Opportunities list (12 items, ranked):
  - score pill
  - kind tag (mention)
  - handle + age
  - 1–2 line snippet
  - state chip

Right column:
- Selected item detail:
  - full text
  - why line
  - actions: Open, Done, Ignore, Got reply
  - optional: metrics

### Mobile (< md)

Single column list. Tap item opens bottom sheet with detail + actions.

## Interaction rules

- Default filter: **New-only + last 24h**.
- One “best item per actor” (≤20 targets) to prevent flooding.
- Actions are always one click/tap away:
  - `Open` (deep link)
  - `Done`
  - `Ignore`
  - `Got reply` (toggle)

Optional (later):
- `j/k` navigation + `Enter` open, `d` done, `i` ignore.

## Visual rules (dense, pro)

- Reduce vertical padding; increase information density.
- Strong typography hierarchy:
  - meta line small (time, score, state)
  - snippet readable
- Always show focus rings (`focus-visible:ring-*`).
- Debug views (raw feed) hidden behind a toggle.


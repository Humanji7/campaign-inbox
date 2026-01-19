# Cockpit UI Research — Prep Kit (v0)

**Date:** 2026-01-19  
**Product:** Brand Ops Cockpit (X-first)  
**Context:** current UI works functionally but is uncomfortable/“old”. We want a triage-first, pro tool feel.

## Goal (one sentence)

In ≤60 seconds, user finds the best “next action” toward `P=2/week`, opens the right thread, and returns to mark outcome — on both desktop and mobile.

## Non-goals (MVP)

- No scheduling/autoposting UI.
- No multi-network board builder yet (fixed layout is OK).
- No “analytics dashboard” aesthetics; this is an action console.

## Core scenarios to optimize

1) Open Cockpit → pick 1 opportunity → `Open` → write reply → `Done` / `Got reply`.
2) Rapid cleanup: scan → `Ignore` items that are noise.
3) Daily habit: see progress to `2/2` and what’s blocking it.

## Research questions

- What layout makes “Do next” feel obvious (not like a feed)?
- How much context is “just enough” before opening X?
- What actions should be 1-tap vs tucked away?
- How to make state (new/ignored/done/got reply) feel satisfying and clear?

## Reference UIs (to screenshot + tag patterns)

**Triage / inbox:** Superhuman, Linear, Gmail “priority inbox”  
**Social monitoring:** X Pro/TweetDeck, Hootsuite, Buffer, Sprout Social  
**Writing + variants:** Typefully, Taplio, Drafts/Notion quick capture  
**Boards:** Notion, Airtable, Trello (only for pattern inspiration)

## What to capture per reference (template)

- **Pattern:** list / master-detail / columns / focus mode / bottom sheet
- **Primary action:** where it lives, 1-tap?
- **Information density:** how many items visible above fold
- **State model:** read/unread, snooze, done, follow-up, etc.
- **Mobile adaptation:** same logic? what collapses?

## Output artifacts (deliverables)

1) “Pattern map” (20–30 screenshots tagged by pattern)
2) Cockpit v2 wireframe: desktop + mobile (same flow)
3) Component spec (blocks + interactions + empty/loading/error states)
4) UI copy rules (microcopy for actions)

## Acceptance criteria (MVP)

- First useful action in ≤60s without scrolling more than ~1 screen.
- User can complete “open → reply → mark done” in ≤3 taps/clicks from Cockpit.
- Opportunities list feels like a work queue, not a raw feed.


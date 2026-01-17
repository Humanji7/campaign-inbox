# Quick Edit v0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add a Quick Edit bottom-sheet to edit an ActionCard’s text + optional structured brief, persist to Supabase, and increment `version`.

**Architecture:** Store `brief` as optional JSON in `public.action_cards.brief` (jsonb). UI edits optimistically in Zustand, then writes to Supabase. Brief fields are optional and validated on boundaries (parse/normalize).

**Tech Stack:** Vite + React + TypeScript + Zustand + Supabase. Tests via Vitest (minimal unit tests).

---

## Task 1: Add `brief` column (DB)

**Files:**
- Create: `supabase/migrations/20260116120000_action_cards_brief.sql`

**Step 1: Write the migration**

```sql
alter table public.action_cards
add column if not exists brief jsonb;
```

**Step 2: Apply migration locally/remote**

Run (local linked project):
```bash
supabase db push
```

Expected: migration applied or “remote database is up to date”.

---

## Task 2: Add brief types + boundary validation

**Files:**
- Modify: `src/types/domain.ts`
- Create: `src/features/cards/brief.ts`
- Test: `src/features/cards/brief.test.ts`

**Step 1: Write failing tests (Vitest) for parsing/normalizing brief**
- Valid object with known keys parses
- Non-object parses to `undefined`
- All fields are optional strings and trimmed

**Step 2: Run tests to verify RED**
Run:
```bash
npm test
```
Expected: FAIL (no test runner / missing module).

**Step 3: Add Vitest test runner**

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

Add dev deps: `vitest`, `jsdom` (only if DOM needed), keep tests unit-only where possible.

**Step 4: Run tests to verify GREEN**
Run:
```bash
npm test
```
Expected: PASS for brief tests.

---

## Task 3: Supabase mapping + update API

**Files:**
- Modify: `src/features/cards/supabaseCards.ts`

**Steps:**
1. Extend select/insert mapping to include `brief`
2. Add `updateCardDraft()` that updates:
   - `content`
   - `brief`
   - `version`
   - optional `status` (only if needed)
   - `updated_at`

**Verification:** Typecheck passes: `npm run build`.

---

## Task 4: Quick Edit sheet UI

**Files:**
- Create: `src/features/edit/QuickEditSheet.tsx`
- Modify: `src/features/inbox/InboxPage.tsx`

**UI Requirements:**
- Bottom sheet modal with:
  - textarea `Post text`
  - collapsible `Brief (optional)` section with 4 fields:
    - hook
    - what_changed
    - why_it_matters
    - next_step_or_cta
- Buttons:
  - `Save`
  - `Cancel`
- On save:
  - optimistic update in Zustand: content + brief + `version += 1` + `updatedAt = now`
  - write to Supabase (best-effort; keep optimistic on failure)

---

## Task 5: Verification (must)

Run:
```bash
npm run build
```

Manual smoke checklist:
- Generate cards from Packs
- Open Inbox, click Edit on a card
- Change post text, save, reload page: edited content persists
- Open edit again: brief fields persist


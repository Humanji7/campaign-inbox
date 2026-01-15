# Campaign Inbox MVP — Implementation Plan

## Defaults

| Область | Решение |
|---------|---------|
| **Mobile** | PWA (Vite + React + TS) |
| **Backend** | Supabase (Auth + Postgres) |
| **UI** | shadcn/ui + Tailwind |
| **State** | Zustand |
| **Gestures** | @use-gesture/react |
| **Generation** | Template-based + LLM (2-stage) |
| **Timeline** | 2 weeks |

---

## Stack

```
Vite + React + TypeScript + Tailwind + shadcn/ui
Supabase (Auth, Postgres, Edge Functions)
Zustand (state) + @use-gesture/react (swipes)
vite-plugin-pwa → Vercel deploy
GitHub OAuth (public repos) → commits as Pack inputs
LLM: Facts/Signals → Template-based generation
```

---

## Phases

### Phase 1: Foundation (Days 1-2)
- [ ] Vite + React + TS scaffold
- [ ] Tailwind + shadcn/ui setup
- [ ] PWA manifest + service worker
- [ ] Supabase project + auth
- [ ] Bottom tabs layout (Inbox, History, Packs, Settings)

### Phase 2: Domain (Day 2)
- [ ] TypeScript types (`ActionCard`, `RiskChip`, `FixAction`)
- [ ] Taste types (`TasteProfile`, versioning)
- [ ] Pack types (`Pack`, `PackRun`, GitHub inputs)
- [ ] Supabase schema + migration

### Phase 3: Inbox (Days 3-5)
- [ ] Card list (Ready / NeedsInfo tabs)
- [ ] Swipe gestures (right=Ship, left=Kill)
- [ ] Empty state

### Phase 4: Card Detail + Quick Edit (Days 5-7)
- [ ] Full preview page
- [ ] Risk chips with fix buttons
- [ ] Quick edit bottom sheet
- [ ] Version tracking on save

### Phase 5: Ship Flow (Days 7-9)
- [ ] Multi-step modal
- [ ] Clipboard copy
- [ ] X deeplink (twitter://post)
- [ ] URL confirmation input
- [ ] Status update → `posted`

### Phase 6: History (Days 9-10)
- [ ] Posted cards list
- [ ] URL + snippet + timestamp

### Phase 7: Packs (Days 10-14)
- [ ] Build-in-public pack
- [ ] Input form
- [ ] GitHub OAuth connect (public repos only)
- [ ] Repo picker (user-selected checklist)
- [ ] Fetch commits (messages + metadata only)
- [ ] LLM: Facts/Signals extraction → structured facts
- [ ] Template-based generation
- [ ] LLM: template-based render (taste + facts → card + risk chips)
- [ ] Card → Inbox

---

## File Structure

```
src/
├── components/ui/       # shadcn
├── features/
│   ├── inbox/
│   ├── card-detail/
│   ├── quick-edit/
│   ├── ship/
│   ├── history/
│   └── packs/
├── lib/
│   ├── supabase.ts
│   └── packs/
├── types/domain.ts
└── App.tsx
```

---

## Out of Scope

- ❌ Direct X publish (OAuth)
- ❌ GitHub private/org repos (MVP)
- ❌ Sending code/diffs to LLM (MVP)
- ❌ Multiple packs
- ❌ Voice Profile
- ❌ Analytics

---

## Verification

1. Generate card via Pack
2. See card in Inbox
3. Swipe → Ship flow
4. Copy + Open X
5. Paste URL → card in History

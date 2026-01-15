# UX/IA & Flows v1 — Campaign Inbox
Дата: 2026-01-15

Цель: зафиксировать карту экранов и основные сценарии для Design sign-off.

Основа: `PLAN.md` + Pack с GitHub commits + taste-first анкета.

## 1) IA (нижние табы)
Bottom tabs:
- Inbox
- History
- Packs
- Settings

## 2) Сценарии (MVP)

### 2.1 Onboarding / First run
1) Login (Supabase Auth)
2) Taste анкета (быстрый режим или болтовой режим) — можно пропустить
3) Packs → Build-in-public → Connect GitHub → Select repos → Generate

### 2.2 Generate cards (Pack)
Packs → Build-in-public:
- connect GitHub (если нет)
- выбрать репозитории (чеклист)
- выбрать период (MVP: N последних коммитов)
- generate → карточки создаются и попадают в Inbox

### 2.3 Inbox triage
Inbox:
- tabs: Ready / NeedsInfo
- swipe right: Ship
- swipe left: Kill

### 2.4 Ship flow
Ship modal (multi-step):
1) Copy to clipboard
2) Open X (deeplink)
3) URL confirm input
4) Save → status `posted` → карточка появляется в History

### 2.5 Quick edit
Card detail:
- full preview
- risk chips + fix buttons
- quick edit bottom sheet
- version tracking on save

## 3) Экранные состояния (минимум)
Inbox:
- loading
- empty Ready / empty NeedsInfo
- error (если не загрузились карточки)

Packs:
- no GitHub connected
- GitHub connected, no repos selected
- repos selected, no commits in window
- generation in progress
- generation error

Ship flow:
- clipboard success/fail
- deeplink opened / fallback
- URL invalid

## 4) Открытые UX вопросы
- Где размещать taste анкету: перед первым Pack или после первой генерации?
- Как показывать “NeedsInfo” (какие причины/кнопки фиксов на первом экране)?


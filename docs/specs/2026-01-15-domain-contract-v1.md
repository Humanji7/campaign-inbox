# Domain Contract v1 — Campaign Inbox
Дата: 2026-01-15

Цель: зафиксировать минимальный стабильный контракт “ядра”, чтобы можно было итеративно улучшать вкус/генерацию без дорогих миграций и рефакторинга.

Источник требований: `PLAN.md` + taste-first уточнения (LLM внутри, GitHub commits как информационный Pack).

## 1) Принципы контракта
- **Стабильность ядра**: `ActionCard` и её жизненный цикл меняются редко.
- **Taste отдельно**: вкус версионируется и связан с карточкой через ссылку на версию.
- **Pack = источник фактов**: карточка всегда знает, из какого Pack/источника она появилась.
- **Безопасность данных**: в MVP не храним и не отправляем в LLM diff/код (только commit messages + метаданные).

## 2) Статусы карточки (state machine)

Минимальный набор статусов (MVP):
- `ready` — можно отправлять в Ship flow
- `needs_info` — идея ок, но не хватает данных/уточнений
- `posted` — опубликовано (есть URL)
- `killed` — намеренно выкинули

Опционально (только если нужно для UX, иначе не вводить):
- `draft` — ещё не классифицировано (лучше избегать; вместо этого сразу `ready`/`needs_info`)

События:
- `generate` (из Pack) → `ready` или `needs_info`
- `swipe_ship` (Inbox) → запускает Ship flow (статус может оставаться прежним, чтобы не плодить состояния)
- `confirm_posted(url)` → `posted`
- `swipe_kill` → `killed`

## 3) Сущности (логический контракт)

### 3.1 ActionCard
Обязательные поля:
- `id`
- `user_id`
- `status` (`ready|needs_info|posted|killed`)
- `content` (текст для публикации)
- `created_at`, `updated_at`
- `version` (int, увеличивается при сохранении через Quick edit)

Поля для Ship/History:
- `posted_url` (nullable; обязателен для `posted`)
- `posted_at` (nullable)
- `snippet` (nullable; короткий кусок, если надо отдельно от `content`)

Связь с вкусом:
- `taste_profile_id`
- `taste_version` (какая версия профиля использовалась при генерации/последнем рендере)

Связь с Pack:
- `pack_id`
- `pack_run_id` (идентификатор конкретного прогона/батча)

Происхождение/факты:
- `source_type` (например `github_commits`)
- `source_ref` (например `repo_full_name`)
- `facts` (JSON массив структурированных фактов; может быть пустым)

Риски и фиксы:
- `risk_chips` (JSON массив; см. ниже)

### 3.2 RiskChip
Risk chips используются в Card Detail (и возможно в Inbox превью).

Минимальная структура:
- `id` (внутри карточки)
- `kind` (enum/string): `missing_context|too_vague|no_proof|needs_link|cta_missing|tone_mismatch|other`
- `label` (короткая надпись)
- `severity` (`low|med|high`)
- `fix_actions` (массив)

### 3.3 FixAction
- `id`
- `label` (что сделать)
- `type`: `open_quick_edit|ask_question|apply_suggestion`
- `payload` (JSON)

### 3.4 TasteProfile (сущность вкуса)
См. `docs/specs/2026-01-15-taste-system-spec-v1.md`.

### 3.5 Pack / PackRun
Pack — “рецепт” + источники данных.

`Pack`:
- `id`, `user_id`
- `type` (MVP: `build_in_public`)
- `config` (JSON; включает выбранные repo)
- `created_at`, `updated_at`

`PackRun`:
- `id`, `pack_id`, `user_id`
- `inputs_digest` (хэш входных данных/параметров)
- `created_at`
- `status` (`ok|error`)
- `error` (nullable)

## 4) Инварианты (обязательные правила)
- Если `status = posted` → `posted_url` обязателен.
- `version` увеличивается только на save в Quick edit (а не на каждую генерацию).
- `taste_version` сохраняется на карточке при генерации/рендеринге.
- В MVP: в `facts` не должно быть кода/диффов.

## 5) Открытые вопросы (для design-pass / tech sign-off)
- Где хранить `risk_chips`: генерировать каждый раз (LLM) или хранить снапшотом на карточке?
- Нужен ли отдельный `killed_at`?
- Нужна ли “перегенерация” карточек при изменении вкуса (кнопка “Re-generate”) в MVP?


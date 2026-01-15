# Supabase Schema & RLS v1 — Campaign Inbox
Дата: 2026-01-15

Цель: описать минимальную схему БД и RLS для MVP, совместимую с Domain Contract v1 и taste-first подходом.

Связанные документы:
- Domain Contract: `docs/specs/2026-01-15-domain-contract-v1.md`
- Taste System: `docs/specs/2026-01-15-taste-system-spec-v1.md`
- Pack Spec: `docs/specs/2026-01-15-build-in-public-pack-spec-v1.md`

## 1) Таблицы (MVP)

### 1.1 `taste_profiles`
Назначение: версионируемые профили вкуса.

Колонки (минимум):
- `id` uuid pk
- `user_id` uuid (fk → auth.users.id)
- `version` int
- `raw_notes` text null
- `data` jsonb (структурированные поля вкуса)
- `created_at` timestamptz
- `updated_at` timestamptz

Индексы:
- `(user_id, version)` unique (или правило “последняя версия” отдельным указателем)

### 1.2 `packs`
Назначение: конфиг “информационного” pack.

Колонки:
- `id` uuid pk
- `user_id` uuid
- `type` text (MVP: `build_in_public`)
- `config` jsonb (выбранные репы, параметры окна N)
- `created_at`, `updated_at`

### 1.3 `pack_runs`
Назначение: конкретные прогоны генерации (батчи).

Колонки:
- `id` uuid pk
- `pack_id` uuid
- `user_id` uuid
- `inputs_digest` text (хэш входов: репы + период + вкус версия + etc)
- `status` text (`ok|error`)
- `error` text null
- `created_at`

### 1.4 `action_cards`
Назначение: карточки для Inbox/History.

Колонки:
- `id` uuid pk
- `user_id` uuid
- `status` text (`ready|needs_info|posted|killed`)
- `content` text
- `snippet` text null
- `version` int
- `taste_profile_id` uuid
- `taste_version` int
- `pack_id` uuid
- `pack_run_id` uuid
- `source_type` text (MVP: `github_commits`)
- `source_ref` text null (например `owner/repo`)
- `facts` jsonb null (массив)
- `risk_chips` jsonb null (массив)
- `posted_url` text null
- `posted_at` timestamptz null
- `created_at`, `updated_at`

Индексы:
- `(user_id, status, created_at)`

## 2) RLS (MVP)
Базовый принцип: каждый пользователь видит/меняет только свои записи.

Политики:
- `taste_profiles`: select/insert/update/delete где `user_id = auth.uid()`
- `packs`: select/insert/update/delete где `user_id = auth.uid()`
- `pack_runs`: select/insert/update/delete где `user_id = auth.uid()`
- `action_cards`: select/insert/update/delete где `user_id = auth.uid()`

Инварианты на уровне БД (минимум):
- check constraint: если `status = 'posted'` → `posted_url is not null`

## 3) Где хранить GitHub access token
Рекомендация для MVP:
- аутентификация через Supabase Auth (GitHub provider),
- GitHub токен хранится в сессии провайдера и используется для вызовов GitHub API,
- LLM ключи — только на сервере (Edge Functions env), не в клиенте.

## 4) Открытые вопросы
- Кэш LLM: отдельная таблица `llm_cache` (digest → result) или достаточно кэша на уровне edge/runtime?
- Хранить ли историю версий TasteProfile как append-only (новая строка на версию) или update + отдельная таблица версий?


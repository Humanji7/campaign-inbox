# LLM Model Strategy (Cheap/Fast) — 2026-01-16

## Контекст

Campaign Inbox генерирует “карточки” для build-in-public на базе GitHub commit messages + метаданных. MVP должен работать без LLM API (fallback), но при наличии ключа — давать качественную генерацию с контролируемой стоимостью.

У нас уже есть 2-stage пайплайн:
1) facts/signals extraction (“дрова”)
2) render карточек (template-style output + risk chips)

## Что делают успешные продукты (наблюдения)

1) **Качество “на витрине” часто делают на сильной модели.** Typefully прямо пишет, что их AI работает на GPT‑4o.
2) **Для “генератора твитов” как утилиты используют более дешёвую модель.** Например, Hootsuite указывает GPT‑3.5 как базовую модель в tweet generator.
3) **Мульти‑провайдерность/BYOK** встречается как способ снижать прямые затраты (платит пользователь), но это добавляет требования к безопасности и UX.

## Закономерности (best practices)

- **Два слоя = два уровня стоимости.** Извлечение фактов/структурирование можно делать на дешёвой модели; “финальный копирайт” можно поднять на более дорогую по кнопке (premium regenerate/polish).
- **Одна “большая” генерация выгоднее множества маленьких.** Просим модель отдать `N` вариантов/карточек за один вызов, чтобы платить за контекст один раз.
- **Токены — главный рычаг.** Минимизируем вход: commit subject + URL + дату, без diff/кода. Жёстко лимитируем `maxCards`, `maxCommits`, `maxTokens`.
- **JSON-first контракт.** Всегда просим строгий JSON (structured output) и валидируем на границе. При ошибке — fallback или повтор.

## Решение (что мы делаем в Campaign Inbox)

### Архитектура интеграции

1) **Оставляем LLM только на сервере (Supabase Edge Function)** — ключи не попадают в браузер.
2) **Единый “OpenAI-compatible” интерфейс**: `LLM_BASE_URL` + `LLM_API_KEY` + модели по env. KISS: поддерживаем только wire-format OpenAI Chat Completions + Bearer auth (OpenAI и совместимые endpoint’ы вроде Gemini OpenAI compatibility).
3) **Режимы качества:**
   - `fallback_no_llm` — сейчас (без денег/ключа)
   - `llm_basic` — дешёвая/быстрая модель по умолчанию
   - `llm_polish` — опциональная “дорогая” модель по кнопке (позже)

### Выбор модели (default)

**Решение для MVP:** держим default на **OpenAI‑compatible** пайплайне, но выбираем модель по “профилю стоимости”.

- **Default (cheap/fast, сбалансировано):** `gpt-5-nano` для обоих этапов.
- **Самый дешёвый вариант (если хотим максимум экономии):** `gemini-3-flash-preview` для обоих этапов (через Gemini OpenAI compatibility endpoint).
- **Upgrade (quality, позже кнопкой):** `gpt-4o` только для этапа render.

Почему так:
- форм-фактор короткий, поэтому “мини/флеш” модели чаще всего достаточно;
- “дорогой” рендер нужен редко, его логичнее включать осознанно.

## Последствия

- Мы можем запускать продукт в **fallback** и собирать `brief`/правки пользователей как датасет (для будущего улучшения качества).
- Когда появится бюджет — включаем `LLM_API_KEY` и сразу получаем “llm_basic”.
- В дальнейшем добавим:
  - кэш по `inputs_digest` в `pack_runs` (чтобы не платить за одинаковые входы)
  - кнопку “Polish” (дорогой рендер)
  - (опционально) BYOK, но только с безопасным хранением (Vault/шифрование + строгий RLS).

## Примечания/ссылки

- Typefully AI: https://typefully.com/ai
- Hootsuite tweet generator: https://www.hootsuite.com/social-media-tools/tweet-generator
- OpenAI pricing: https://openai.com/api/pricing/
- Gemini API pricing: https://ai.google.dev/pricing
- Vertex AI pricing (Gemini): https://cloud.google.com/vertex-ai/generative-ai/pricing

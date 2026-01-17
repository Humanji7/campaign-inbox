# Supabase Edge Functions + LLM Runbook — 2026-01-17

Этот документ фиксирует “как оно реально работает” для Campaign Inbox (MVP) и какие грабли мы уже поймали.

## 0) Golden checks (быстро понять что всё ок)

1) В приложении: **Packs → Generate cards → Inbox**
2) В notification должно быть: `Mode: llm`

Если `Mode: fallback_*` — см. Troubleshooting ниже.

## 1) Локальный фронт (Vite)

Файл: `.env`

Нужно:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable key)

Проверка:
- `npm run doctor`

## 2) Supabase Edge Function secrets (remote)

Secrets задаются в Supabase, а не в `.env` (кроме локальной serve-разработки).

Проверка:
- `supabase secrets list --project-ref <ref> --output pretty`

### 2.1 OpenAI (по умолчанию)

Задать:
```bash
supabase secrets set --project-ref <ref> \
  LLM_BASE_URL=https://api.openai.com/v1 \
  LLM_API_KEY=... \
  LLM_FACTS_MODEL=gpt-5-nano \
  LLM_RENDER_MODEL=gpt-5-nano \
  LLM_MAX_TOKENS=1200 \
  LLM_TIMEOUT_MS=20000 \
  LLM_REASONING_EFFORT=minimal
```

### 2.2 Gemini через OpenAI-compat endpoint (опционально)

```bash
supabase secrets set --project-ref <ref> \
  LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
  LLM_API_KEY=... \
  LLM_FACTS_MODEL=gemini-3-flash-preview \
  LLM_RENDER_MODEL=gemini-3-flash-preview \
  LLM_MAX_TOKENS=1200 \
  LLM_TIMEOUT_MS=20000
```

## 3) Deploy Edge Function (главная грабля)

Мы **НЕ используем legacy JWT verify**, потому что Supabase может отклонять современные ES256 JWT *до выполнения кода* (401 с пустым body).

Деплой всегда делаем так:
- `npm run deploy:generate-cards`

Эквивалент:
```bash
supabase functions deploy generate-cards --project-ref <ref> --no-verify-jwt
```

## 4) Почему GPT‑5 “молчал” и как это фикснули

Симптом:
- `finish_reason: "length"` и `content` пустой → `LLM returned no content`.

Решение для GPT‑5 в `supabase/functions/_shared/llm.ts`:
- используем роль `developer` вместо `system`
- включаем `response_format: { type: "json_object" }` (только для `api.openai.com`)
- ставим `reasoning_effort=minimal` (иначе модель может “съесть” бюджет на reasoning и не отдать текст)
- не передаём `temperature` для `gpt-5*` (кроме `gpt-5.2*`)

## 5) Troubleshooting

### 5.1 `401 body={}` (часто после деплоя)

Причина: на функции включён тумблер **“Verify JWT with legacy secret”**.

Фикс:
- деплой только с `--no-verify-jwt`
- в Dashboard: Edge Functions → `generate-cards` → Details → выключить “Verify JWT with legacy secret”

### 5.2 `Mode: fallback_llm_error`

Значит LLM вызов упал, но карточки сгенерились fallback-логикой.

Смотри `LLM error` и `LLM debug` в UI:
- `timed out` → увеличь `LLM_TIMEOUT_MS`
- `LLM error 401/403` → ключ/права
- `no content` → см. раздел GPT‑5 выше (reasoning/json mode)

### 5.3 “Settings поменял Voice/Taste, но карточки не обновились”

Это ожидаемо для MVP: вкус применяется **только при новой генерации**.

Плановое улучшение: кнопка `Regenerate with current taste` (пересоздать карточки или сделать новую ревизию).


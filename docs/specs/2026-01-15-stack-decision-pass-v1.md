# Stack Decision Pass v1 — Campaign Inbox
Дата: 2026-01-15

Цель: выбрать стек, который минимизирует трение до публикации и ускоряет итерации (ИИ делает код), при этом поддерживает:
- PWA
- clipboard + deeplink
- Supabase (auth + postgres + edge functions)
- GitHub OAuth (public repos)
- LLM (2-stage)

## 1) Варианты стека (MVP)

### Вариант A (базовый из `PLAN.md`)
- Vite + React + TypeScript + Tailwind + shadcn/ui
- Supabase Auth (GitHub provider) + Postgres + Edge Functions
- Deploy: Vercel (PWA)

Плюсы: быстро, просто, совпадает с планом.  
Минусы: OAuth callback/redirect нюансы в SPA (но решаемо через Supabase Auth).

### Вариант B (SSR/Fullstack)
- Next.js (App Router) + TS + Tailwind + shadcn/ui
- Supabase
- Deploy: Vercel

Плюсы: проще строить OAuth/callback/edge и прокси к GitHub/LLM.  
Минусы: чуть тяжелее, больше moving parts.

## 2) Рекомендация (по умолчанию)
Стартовать с **A**, если Supabase Auth GitHub provider закрывает OAuth, а LLM вызовы идут через Supabase Edge Functions (ключи не в клиенте).

Перейти на **B**, если упрёмся в ограничения SPA по OAuth/прокси/кэшу.

## 2.1 Решение (MVP)
Выбираем **Вариант A**:
- Vite + React + TS + Tailwind + shadcn/ui
- PWA (vite-plugin-pwa)
- Supabase Auth + Postgres
- Supabase Edge Functions для LLM (ключи провайдера только на сервере)

GitHub данные (MVP):
- GitHub OAuth через Supabase provider
- запросы к GitHub API делаем **с клиента** с provider token из Supabase session
- читаем только public repos и только commit messages + метаданные

## 3) LLM провайдеры (решение отдельно)
Роль 1 (“дрова”): качество извлечения сигналов важно → допускается более сильная модель (например Opus или GPT-5.2).  
Роль 2 (template-based): более дешёвая модель возможна при сохранении качества.

Нужно зафиксировать:
- провайдер(ы)
- модели по ролям
- лимиты токенов/кэш

Решение (MVP):
- один провайдер на оба слоя (чтобы быстрее)
- конфиг через env: `LLM_FACTS_MODEL`, `LLM_RENDER_MODEL`, `LLM_MAX_TOKENS`, `LLM_TEMPERATURE`

## 4) Check-list для выбора
- PWA + offline не ломает auth/ship flow
- clipboard стабилен на мобиле
- `twitter://post` имеет fallback (например `https://x.com/intent/tweet`)
- GitHub OAuth public-only + выбор реп работает без сюрпризов
- LLM ключи не уходят в клиент
- стоимость контролируема (кэш, лимиты, батчи)

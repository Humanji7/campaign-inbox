# Taste System Spec v1 — Campaign Inbox (taste-first)
Дата: 2026-01-15

Цель: сделать вкус/голос/перо управляемыми и улучшаемыми, даже если пользователь “не знает” и находится в процессе ресерча.

Связанные документы:
- Review протокол: `docs/plans/2026-01-15-campaign-inbox-review-protocol.md`
- Domain Contract: `docs/specs/2026-01-15-domain-contract-v1.md`
- Build-in-public Pack: `docs/specs/2026-01-15-build-in-public-pack-spec-v1.md`

## 1) Требования
- Вкус **не обязателен** для старта: “не знаю/по умолчанию” — валидно.
- Поддержка “болтового ввода” (`raw_notes`).
- Вкус версионируется; карточки привязаны к версии вкуса.
- Вкус меняется часто; ядро карточки — редко.

## 2) TasteProfile (логическая модель)
Минимальный контракт (все поля опциональны, кроме `id/version/user_id`):

```yaml
TasteProfile:
  id: string
  user_id: string
  version: number
  updated_at: string

  raw_notes: string | null

  goal: string | null
  audience: string | null

  topics_allowed: [string]
  topics_banned: [string]

  tone:
    adjectives: [string]
    energy: string | null

  format:
    length: string | null
    structure: [string]
    emojis: string | null

  cta:
    intensity: string | null # off/soft/normal/strong
    preferred_types: [string]

  examples:
    links: [string]
    snippets: [string]
```

## 3) Анкета вкуса v1 (UX правила)
Форма “жёсткая”, но ответы “мягкие”.

Правила:
- каждый блок имеет `Не знаю / Пропустить / По умолчанию`,
- есть быстрый режим (2–3 ответа → можно генерировать),
- есть “болтовой режим”: одно большое поле `raw_notes`, которое считается полноценным вводом.

## 4) Progressive refinement (после действий)
После Ship (или после просмотра карточки) задаётся 1 микро‑вопрос, который меняет вкус без повторной анкеты:
- длина (короче/длиннее)
- CTA (off/soft/normal/strong)
- тон (спокойнее/энергичнее)
- структура (bullets/история/хук)

## 5) Как вкус влияет на генерацию
Вкус не “пишет текст сам”, он задаёт ограничения и предпочтения:
- формат (длина/структура/эмодзи)
- табу/темы
- тон (прилагательные/энергия)
- CTA интенсивность
- примеры (если есть)

## 6) LLM пайплайн (2 слоя)
Требование: LLM внутри продукта обязателен, но генерация остаётся template-based.

1) **Facts/Signals LLM** (“дрова”):  
вход: commit messages + метаданные (+ краткий контекст Pack)  
выход: JSON “факты/наблюдения/изменения/уроки/темы” (без кода).

2) **Template-based LLM**:  
вход: TasteProfile + facts + выбранный template  
выход: `ActionCard.content` + `risk_chips` + предложения фиксов.

## 7) Контроль стоимости и качества
- лимитируем N коммитов на прогон (например 20–50),
- кэшируем результат Facts/Signals по `inputs_digest`,
- не отправляем в LLM код/диффы в MVP (и в Build-in-public MVP берём только messages + метаданные),
- если нет данных/вкус пустой → используем дефолтные шаблоны.

## 8) Открытые вопросы
- Что является “версией вкуса”: snapshot JSON целиком или event log изменений?
- В MVP: сохранять ли все ответы анкеты как отдельные поля, или достаточно `raw_notes` + небольшого набора переключателей?

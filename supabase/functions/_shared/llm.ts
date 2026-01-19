export type LlmConfig = {
  apiKey: string
  baseUrl: string
  factsModel: string
  renderModel: string
  maxTokens: number
  temperature?: number
  timeoutMs: number
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export function getLlmConfig(): LlmConfig | null {
  const apiKey = Deno.env.get('LLM_API_KEY') ?? ''
  if (!apiKey) return null

  const baseUrl = Deno.env.get('LLM_BASE_URL') ?? 'https://api.openai.com/v1'
  const factsModel = Deno.env.get('LLM_FACTS_MODEL') ?? 'gpt-5-nano'
  const renderModel = Deno.env.get('LLM_RENDER_MODEL') ?? factsModel
  const maxTokensRaw = Deno.env.get('LLM_MAX_TOKENS') ?? '1200'
  const maxTokensParsed = Number(maxTokensRaw)
  const maxTokens =
    Number.isFinite(maxTokensParsed) && maxTokensParsed >= 16 ? Math.floor(maxTokensParsed) : 1200
  const temperatureRaw = Deno.env.get('LLM_TEMPERATURE')
  const temperatureParsed = temperatureRaw ? Number(temperatureRaw) : undefined
  const temperature = typeof temperatureParsed === 'number' && Number.isFinite(temperatureParsed) ? temperatureParsed : undefined

  const timeoutMsRaw = Deno.env.get('LLM_TIMEOUT_MS') ?? '20000'
  const timeoutMsParsed = Number(timeoutMsRaw)
  const timeoutMs = Number.isFinite(timeoutMsParsed) && timeoutMsParsed > 0 ? Math.floor(timeoutMsParsed) : 20000

  const effortRaw = (Deno.env.get('LLM_REASONING_EFFORT') ?? '').toLowerCase().trim()
  // Back-compat: older configs may set "none"/"xhigh". OpenAI GPT-5 rejects them (supported:
  // minimal|low|medium|high). Treat them as unset.
  const envEffort =
    effortRaw === 'none' || effortRaw === 'xhigh' ? undefined : isReasoningEffort(effortRaw) ? effortRaw : undefined
  const reasoningEffort = envEffort ?? (factsModel.toLowerCase().startsWith('gpt-5') ? 'minimal' : undefined)

  return { apiKey, baseUrl, factsModel, renderModel, maxTokens, temperature, timeoutMs, reasoningEffort }
}

export async function chatJson<T>(cfg: LlmConfig, input: { model: string; system: string; user: string }): Promise<T> {
  // KISS: we only support the OpenAI Chat Completions wire format with Bearer auth:
  // POST {LLM_BASE_URL}/chat/completions
  //
  // This works with OpenAI, and with OpenAI-compatible endpoints that accept the same
  // request format + Bearer auth (e.g. Gemini's OpenAI compatibility endpoint).

  const baseUrl = cfg.baseUrl.endsWith('/') ? cfg.baseUrl.slice(0, -1) : cfg.baseUrl
  const temperature = supportsTemperature(input.model) ? cfg.temperature : undefined
  const defaultReasoningEffort = getReasoningEffortForModel(input.model, cfg.reasoningEffort)
  const systemRole = prefersDeveloperRole(input.model) ? 'developer' : 'system'
  const responseFormat = supportsOpenAiJsonMode(baseUrl) ? { type: 'json_object' } : undefined

  const timeoutMs = Number.isFinite(cfg.timeoutMs) && cfg.timeoutMs > 0 ? cfg.timeoutMs : 20000

  async function doRequest(args: {
    reasoningEffort: LlmConfig['reasoningEffort'] | undefined
    maxTokens: number
  }): Promise<any> {
    const reasoningEffort = getReasoningEffortForModel(input.model, args.reasoningEffort)
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort('timeout'), timeoutMs)
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: input.model,
          ...(typeof temperature === 'number' ? { temperature } : {}),
          ...(typeof reasoningEffort === 'string' ? { reasoning_effort: reasoningEffort } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
          // OpenAI: prefer max_completion_tokens (max_tokens is deprecated for Chat Completions).
          // Gemini OpenAI compatibility: supports max_completion_tokens as alias for max_tokens.
          max_completion_tokens: args.maxTokens,
          messages: [
            { role: systemRole, content: input.system },
            { role: 'user', content: input.user }
          ]
        })
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`LLM error ${res.status} (baseUrl=${baseUrl}): ${txt}`)
      }

      const data = (await res.json()) as any
      return data
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error(`LLM request timed out after ${timeoutMs}ms (baseUrl=${baseUrl})`)
      }
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`LLM network error (baseUrl=${baseUrl}): ${msg}`)
    } finally {
      clearTimeout(t)
    }
  }

  let data = await doRequest({ reasoningEffort: defaultReasoningEffort, maxTokens: cfg.maxTokens })

  if (data?.error) {
    const msg =
      typeof data.error?.message === 'string'
        ? data.error.message
        : typeof data.error === 'string'
          ? data.error
          : JSON.stringify(data.error)
    throw new Error(`LLM returned error payload (HTTP 200) (baseUrl=${baseUrl}): ${msg}`)
  }

  let extracted = extractTextFromChatCompletion(data)
  let content = extracted.text

  // GPT‑5 can burn completion budget on reasoning and return empty visible content with finish_reason=length.
  // Retry once with a larger completion budget to allow emitting JSON.
  const finishReason = String((extracted.meta ?? {})['finish_reason'] ?? '')
  if (
    (!content || content.trim() === '') &&
    finishReason === 'length' &&
    supportsReasoningEffort(input.model) &&
    cfg.maxTokens < 4096
  ) {
    const bumped = Math.min(4096, Math.max(cfg.maxTokens + 256, cfg.maxTokens * 2))
    data = await doRequest({ reasoningEffort: defaultReasoningEffort, maxTokens: bumped })
    extracted = extractTextFromChatCompletion(data)
    content = extracted.text
  }

  if (!content || typeof content !== 'string' || content.trim() === '') {
    const meta = extracted.meta ?? {}
    throw new Error(`LLM returned no content (baseUrl=${baseUrl}): ${JSON.stringify(meta)}`)
  }

  const parsed = parseJsonFromText(content)
  return parsed as T
}

function supportsTemperature(model: string): boolean {
  // OpenAI docs: GPT‑5 family models reject temperature/top_p and related sampling params.
  // GPT‑5.2 models re-introduce them, so we only disable for "gpt-5*" excluding "gpt-5.2*".
  const m = (model ?? '').toLowerCase()
  if (!m.startsWith('gpt-5')) return true
  return m.startsWith('gpt-5.2')
}

function supportsReasoningEffort(model: string): boolean {
  const m = (model ?? '').toLowerCase()
  // Reasoning effort exists for newer reasoning families; keep it narrow to avoid 400s.
  return m.startsWith('gpt-5') || m.startsWith('o')
}

function getReasoningEffortForModel(
  model: string,
  effort: LlmConfig['reasoningEffort'] | undefined
): LlmConfig['reasoningEffort'] | undefined {
  if (!supportsReasoningEffort(model)) return undefined
  if (!effort) return undefined

  const m = (model ?? '').toLowerCase()
  if (m.startsWith('gpt-5')) return effort
  return effort
}

function prefersDeveloperRole(model: string): boolean {
  const m = (model ?? '').toLowerCase()
  // OpenAI docs: with o1 models and newer, developer messages replace system messages.
  return m.startsWith('gpt-5') || m.startsWith('o')
}

function supportsOpenAiJsonMode(baseUrl: string): boolean {
  // JSON mode (`response_format: {type:"json_object"}`) is an OpenAI feature.
  // Keep off for other OpenAI-compatible providers to avoid 400s.
  return baseUrl.includes('api.openai.com')
}

function isReasoningEffort(v: string): v is LlmConfig['reasoningEffort'] {
  return v === 'minimal' || v === 'low' || v === 'medium' || v === 'high'
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      // fall through
    }
  }

  // Try extract first JSON block
  const firstBrace = trimmed.indexOf('{')
  const firstBracket = trimmed.indexOf('[')
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket)

  if (start === -1) throw new Error('LLM returned non-JSON')

  const candidate = trimmed.slice(start)
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
  if (end === -1) throw new Error('LLM returned incomplete JSON')

  const jsonText = candidate.slice(0, end + 1)
  return JSON.parse(jsonText)
}

function extractTextFromChatCompletion(data: any): { text: string | null; meta: Record<string, unknown> } {
  const choice = data?.choices?.[0]
  const message = choice?.message
  const content = message?.content

  // Standard OpenAI Chat Completions shape
  if (typeof content === 'string') {
    return {
      text: content,
      meta: {
        model: data?.model,
        finish_reason: choice?.finish_reason,
        content_type: 'string'
      }
    }
  }

  // Some providers may return an array of content parts.
  if (Array.isArray(content)) {
    const parts = content
      .map((p: any) => {
        if (typeof p === 'string') return p
        if (typeof p?.text === 'string') return p.text
        if (typeof p?.content === 'string') return p.content
        if (typeof p?.text?.value === 'string') return p.text.value
        return ''
      })
      .filter(Boolean)
    const joined = parts.join('')
    return {
      text: joined || null,
      meta: {
        model: data?.model,
        finish_reason: choice?.finish_reason,
        content_type: 'array',
        content_parts: parts.length
      }
    }
  }

  // Legacy "text" field fallback.
  if (typeof choice?.text === 'string') {
    return {
      text: choice.text,
      meta: {
        model: data?.model,
        finish_reason: choice?.finish_reason,
        content_type: 'choice.text'
      }
    }
  }

  // Debug metadata only (avoid leaking any generated content).
  const messageKeys = message && typeof message === 'object' ? Object.keys(message) : []
  return {
    text: null,
    meta: {
      model: data?.model,
      object: data?.object,
      finish_reason: choice?.finish_reason,
      has_message: Boolean(message),
      message_keys: messageKeys,
      content_type: Array.isArray(content) ? 'array' : content === null ? 'null' : typeof content,
      has_tool_calls: Boolean(message?.tool_calls),
      has_refusal: Boolean(message?.refusal),
      usage_present: Boolean(data?.usage)
    }
  }
}

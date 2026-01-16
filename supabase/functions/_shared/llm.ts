type LlmProvider = 'openai'

export type LlmConfig = {
  provider: LlmProvider
  apiKey: string
  baseUrl: string
  factsModel: string
  renderModel: string
  maxTokens: number
  temperature: number
}

export function getLlmConfig(): LlmConfig | null {
  const apiKey = Deno.env.get('LLM_API_KEY') ?? ''
  if (!apiKey) return null

  const provider = (Deno.env.get('LLM_PROVIDER') ?? 'openai') as LlmProvider
  const baseUrl = Deno.env.get('LLM_BASE_URL') ?? 'https://api.openai.com/v1'
  const factsModel = Deno.env.get('LLM_FACTS_MODEL') ?? 'gpt-4o-mini'
  const renderModel = Deno.env.get('LLM_RENDER_MODEL') ?? factsModel
  const maxTokens = Number(Deno.env.get('LLM_MAX_TOKENS') ?? '1200')
  const temperature = Number(Deno.env.get('LLM_TEMPERATURE') ?? '0.3')

  return { provider, apiKey, baseUrl, factsModel, renderModel, maxTokens, temperature }
}

export async function chatJson<T>(cfg: LlmConfig, input: { model: string; system: string; user: string }): Promise<T> {
  if (cfg.provider !== 'openai') throw new Error(`Unsupported LLM provider: ${cfg.provider}`)

  const baseUrl = cfg.baseUrl.endsWith('/') ? cfg.baseUrl.slice(0, -1) : cfg.baseUrl
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user }
      ]
    })
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`LLM error ${res.status}: ${txt}`)
  }

  const data = (await res.json()) as any
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') throw new Error('LLM returned no content')

  const parsed = parseJsonFromText(content)
  return parsed as T
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

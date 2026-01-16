export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  })
}

export async function safeJson(req: Request): Promise<unknown> {
  const text = await req.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}


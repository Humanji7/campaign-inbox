/// <reference types="https://deno.land/x/deno_types@v0.1.0/index.d.ts" />

import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, safeJson } from '../_shared/json.ts'
import { redactSecrets } from '../_shared/redact.ts'

type IngestEventInput = {
  source: string
  type: string
  externalId: string
  occurredAt: string
  actorHandle?: string | null
  targetHandle?: string | null
  url?: string | null
  text?: string | null
  payload?: Record<string, unknown> | null
}

type RequestBody = {
  events: IngestEventInput[]
  meta?: Record<string, unknown>
}

function requireIngestSecret(req: Request): { ok: true } | { ok: false; error: string } {
  const expected = (Deno.env.get('INGEST_SECRET') ?? '').trim()
  if (!expected) return { ok: false, error: 'Server misconfigured: missing INGEST_SECRET' }

  const got = (req.headers.get('x-ingest-secret') ?? '').trim()
  if (!got) return { ok: false, error: 'Unauthorized: missing x-ingest-secret' }
  if (got !== expected) return { ok: false, error: 'Unauthorized: invalid x-ingest-secret' }
  return { ok: true }
}

function requireIngestUserId(): { ok: true; userId: string } | { ok: false; error: string } {
  const userId = (Deno.env.get('INGEST_USER_ID') ?? '').trim()
  if (!userId) return { ok: false, error: 'Server misconfigured: missing INGEST_USER_ID' }
  // Basic UUID sanity check.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return { ok: false, error: 'Server misconfigured: INGEST_USER_ID is not a UUID' }
  }
  return { ok: true, userId }
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  // @ts-ignore
  const hash = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hash)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function clampText(raw: unknown, maxLen = 4000): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return null
  return redactSecrets(s).slice(0, maxLen)
}

function normalizeHandle(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return null
  return s.startsWith('@') ? s.slice(1) : s
}

function normalizeEvents(input: IngestEventInput[], userId: string): Promise<any[]> {
  const nowIso = new Date().toISOString()
  const list = Array.isArray(input) ? input : []

  return Promise.all(
    list
      .filter(e => {
        if (!e || typeof e !== 'object') return false
        const source = String((e as any).source ?? '').trim()
        const type = String((e as any).type ?? '').trim()
        const externalId = String((e as any).externalId ?? '').trim()
        return Boolean(source && type && externalId)
      })
      .map(async e => {
        const source = String(e.source ?? '').trim().slice(0, 32)
        const type = String(e.type ?? '').trim().slice(0, 32)
        const externalId = String(e.externalId ?? '').trim().slice(0, 128)
        const occurredAtRaw = String(e.occurredAt ?? '').trim()
        const occurredAt = occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw)) ? occurredAtRaw : nowIso

        const actorHandle = normalizeHandle(e.actorHandle)
        const targetHandle = normalizeHandle(e.targetHandle)
        const url = typeof e.url === 'string' && e.url.trim() ? e.url.trim().slice(0, 2048) : null
        const text = clampText(e.text)
        const payload =
          e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload) ? e.payload : ({} as Record<string, unknown>)

        const dedupeKey = await sha256Hex(`v1:${userId}:${source}:${type}:${externalId}`)

        return {
          user_id: userId,
          source,
          type,
          external_id: externalId,
          occurred_at: occurredAt,
          actor_handle: actorHandle,
          target_handle: targetHandle,
          url,
          text,
          payload,
          dedupe_key: dedupeKey
        }
      })
  )
}

async function upsertUnifiedEvents(rows: any[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: 'Server misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' }
  }

  if (!rows.length) return { ok: true, count: 0 }

  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/unified_events?on_conflict=user_id,dedupe_key`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { ok: false, error: `DB upsert failed: status=${res.status} body=${txt.slice(0, 500)}` }
  }

  return { ok: true, count: rows.length }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)

    const secret = requireIngestSecret(req)
    if (!secret.ok) return jsonResponse({ error: secret.error }, 401, corsHeaders)

    const user = requireIngestUserId()
    if (!user.ok) return jsonResponse({ error: user.error }, 500, corsHeaders)

    const parsed = (await safeJson(req)) as RequestBody | null
    if (!parsed || !Array.isArray(parsed.events)) {
      return jsonResponse({ error: 'Invalid body: events[] required' }, 400, corsHeaders)
    }

    const rows = await normalizeEvents(parsed.events, user.userId)
    const upsert = await upsertUnifiedEvents(rows)
    if (!upsert.ok) return jsonResponse({ error: upsert.error }, 500, corsHeaders)

    return jsonResponse({ ok: true, received: parsed.events.length, upserted: upsert.count }, 200, corsHeaders)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg.slice(0, 2000) }, 500, corsHeaders)
  }
})

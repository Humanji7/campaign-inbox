import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function readTextIfExists(path) {
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

function parseDotEnv(text) {
  const env = new Map()
  if (!text) return env
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const cleaned = line.startsWith('export ') ? line.slice('export '.length) : line
    const eq = cleaned.indexOf('=')
    if (eq === -1) continue
    const key = cleaned.slice(0, eq).trim()
    const value = cleaned.slice(eq + 1).trim()
    if (!key) continue
    env.set(key, value)
  }
  return env
}

function getEnv(key, fallbackMap) {
  return process.env[key] || (fallbackMap ? fallbackMap.get(key) : undefined) || ''
}

function clampText(s, max = 4000) {
  const t = String(s ?? '').trim()
  if (!t) return null
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

function firstUrl(text) {
  const t = String(text ?? '')
  // Simple URL matcher good enough for MVP.
  const m = t.match(/https?:\/\/[^\s)]+/i)
  return m?.[0] ? m[0].trim() : null
}

async function getJson(url) {
  const res = await fetch(url)
  const txt = await res.text().catch(() => '')
  let json = null
  try {
    json = txt ? JSON.parse(txt) : null
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, text: txt, json }
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  const txt = await res.text().catch(() => '')
  let json = null
  try {
    json = txt ? JSON.parse(txt) : null
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, text: txt, json }
}

function readOffset(path) {
  if (!existsSync(path)) return { offset: 0 }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { offset: 0 }
  }
}

function writeOffset(path, offset) {
  writeFileSync(path, JSON.stringify({ offset }, null, 2), 'utf8')
}

async function main() {
  const cwd = process.cwd()
  const dotEnv = parseDotEnv(readTextIfExists(join(cwd, '.env')))

  const supabaseUrl = getEnv('VITE_SUPABASE_URL', dotEnv)
  const ingestSecret = getEnv('INGEST_SECRET', dotEnv)
  const token = getEnv('TELEGRAM_BOT_TOKEN', dotEnv)
  const chatId = getEnv('TELEGRAM_CHAT_ID', dotEnv)

  if (!supabaseUrl) {
    console.error('[tg-companion] missing VITE_SUPABASE_URL')
    process.exit(1)
  }
  if (!ingestSecret) {
    console.error('[tg-companion] missing INGEST_SECRET (same value as Supabase secret)')
    process.exit(1)
  }
  if (!token) {
    console.error('[tg-companion] missing TELEGRAM_BOT_TOKEN')
    process.exit(1)
  }
  if (!chatId) {
    console.error('[tg-companion] missing TELEGRAM_CHAT_ID (restrict updates to your chat)')
    process.exit(1)
  }

  const offsetPath = join(cwd, '.tg-companion-offset.json')
  const { offset: lastOffset } = readOffset(offsetPath)
  const startOffset = Number(lastOffset) || 0

  const apiBase = `https://api.telegram.org/bot${token}`
  const updatesUrl = `${apiBase}/getUpdates?timeout=0&allowed_updates=%5B%22message%22%5D&offset=${startOffset}`
  const updates = await getJson(updatesUrl)
  if (!updates.ok || !updates.json?.ok) {
    console.error('[tg-companion] getUpdates failed:', `status=${updates.status}`, updates.text.slice(0, 400))
    process.exit(1)
  }

  const list = Array.isArray(updates.json.result) ? updates.json.result : []
  if (list.length === 0) {
    console.log('[tg-companion] no updates')
    process.exit(0)
  }

  let maxUpdateId = startOffset
  const events = []

  for (const u of list) {
    const updateId = Number(u?.update_id ?? 0)
    if (Number.isFinite(updateId) && updateId >= maxUpdateId) maxUpdateId = updateId + 1

    const msg = u?.message
    const fromChat = String(msg?.chat?.id ?? '')
    if (fromChat !== String(chatId)) continue

    const messageId = String(msg?.message_id ?? '')
    const text =
      typeof msg?.text === 'string'
        ? msg.text
        : typeof msg?.caption === 'string'
          ? msg.caption
          : ''

    const occurredAt = typeof msg?.date === 'number' ? new Date(msg.date * 1000).toISOString() : new Date().toISOString()
    const url = firstUrl(text)

    const externalId = `tg:${fromChat}:${messageId || updateId}`
    events.push({
      source: 'telegram',
      type: 'inbox',
      externalId,
      occurredAt,
      actorHandle: msg?.from?.username ? String(msg.from.username) : null,
      url,
      text: clampText(text),
      payload: { chatId: fromChat, messageId, updateId }
    })
  }

  writeOffset(offsetPath, maxUpdateId)

  if (!events.length) {
    console.log('[tg-companion] updates received but none matched TELEGRAM_CHAT_ID')
    process.exit(0)
  }

  const ingestUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ingest-events`
  const res = await postJson(
    ingestUrl,
    { 'x-ingest-secret': ingestSecret },
    { events, meta: { source: 'telegram', received_updates: list.length } }
  )

  if (!res.ok) {
    console.error('[tg-companion] ingest failed:', `status=${res.status}`, res.text.slice(0, 600))
    process.exit(1)
  }

  console.log('[tg-companion] ok:', res.json || { status: res.status })
}

await main()


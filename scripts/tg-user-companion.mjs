import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

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

function hasLink(text) {
  const t = String(text ?? '')
  return /https?:\/\/\S+/i.test(t)
}

function looksLikeQuestion(text) {
  const t = String(text ?? '').toLowerCase()
  if (!t) return false
  if (t.includes('?')) return true
  // RU/EN weak heuristics for MVP.
  return (
    t.includes('кто ') ||
    t.includes('как ') ||
    t.includes('почему ') ||
    t.includes('зачем ') ||
    t.includes('help') ||
    t.includes('how ') ||
    t.includes('anyone ') ||
    t.includes('recommend')
  )
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8')
}

function tgLinkFromEntity(entity, msgId) {
  const username = entity?.username
  if (username) return `https://t.me/${username}/${msgId}`

  // For private supergroups/channels Telegram uses /c/<internal>/<msgId>
  // internal is chat_id without -100 prefix.
  const id = Number(entity?.id)
  if (!Number.isFinite(id)) return null

  const abs = Math.abs(id)
  // Heuristic: supergroup/channel ids are often 10-13 digits. We don’t know if -100 is present in GramJS id,
  // but in practice, /c/ expects the numeric id without -100.
  const internal = abs > 1_000_000_000_000 ? abs - 1_000_000_000_000 : abs
  if (!Number.isFinite(internal) || internal <= 0) return null
  return `https://t.me/c/${internal}/${msgId}`
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

async function main() {
  const cwd = process.cwd()
  const dotEnv = parseDotEnv(readTextIfExists(join(cwd, '.env')))

  const apiIdRaw = getEnv('TELEGRAM_API_ID', dotEnv)
  const apiHash = getEnv('TELEGRAM_API_HASH', dotEnv)
  const apiId = Number(apiIdRaw)
  if (!Number.isFinite(apiId) || !apiHash) {
    console.error('[tg-user] missing TELEGRAM_API_ID / TELEGRAM_API_HASH')
    process.exit(1)
  }

  const supabaseUrl = getEnv('VITE_SUPABASE_URL', dotEnv)
  const ingestSecret = getEnv('INGEST_SECRET', dotEnv)
  if (!supabaseUrl || !ingestSecret) {
    console.error('[tg-user] missing VITE_SUPABASE_URL / INGEST_SECRET')
    process.exit(1)
  }

  const sessionPath = join(cwd, '.tg-user.session')
  const sessionString = readTextIfExists(sessionPath)?.trim() || ''
  if (!sessionString) {
    console.error('[tg-user] missing .tg-user.session. Run: `npm run tg:user:setup`')
    process.exit(1)
  }

  const watchPath = join(cwd, '.tg-user-watch.json')
  const watch = readJson(watchPath, null)
  if (!watch || !Array.isArray(watch.watchChatIds) || watch.watchChatIds.length === 0) {
    console.error('[tg-user] missing watch list. Add chat ids to .tg-user-watch.json → watchChatIds[]')
    process.exit(1)
  }

  const triggers = watch.triggers || { includeLinks: true, includeQuestions: true, includeAll: false }
  const maxPerChat = Math.max(5, Math.min(200, Number(watch.maxPerChat ?? 40)))

  const offsetsPath = join(cwd, '.tg-user-offset.json')
  const offsets = readJson(offsetsPath, { chats: {} })
  if (!offsets.chats || typeof offsets.chats !== 'object') offsets.chats = {}

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 3 })
  await client.connect()

  const events = []

  for (const rawId of watch.watchChatIds) {
    const chatId = Number(rawId)
    if (!Number.isFinite(chatId)) continue
    const lastMsgId = Number(offsets.chats[String(chatId)] ?? 0) || 0

    const entity = await client.getEntity(chatId)
    const messages = await client.getMessages(entity, { limit: maxPerChat })

    let maxSeen = lastMsgId
    for (const m of messages) {
      const msgId = Number(m?.id ?? 0)
      if (!Number.isFinite(msgId) || msgId <= lastMsgId) continue
      if (msgId > maxSeen) maxSeen = msgId

      const text = clampText(m?.message ?? '')
      if (!text) continue

      const include =
        triggers.includeAll === true ||
        (triggers.includeLinks !== false && hasLink(text)) ||
        (triggers.includeQuestions !== false && looksLikeQuestion(text))
      if (!include) continue

      const occurredAt = m?.date ? new Date(m.date * 1000).toISOString() : new Date().toISOString()

      const sender = m?.sender
      const actorHandle = sender?.username ? String(sender.username) : sender?.firstName ? String(sender.firstName) : null
      const targetHandle = entity?.username ? String(entity.username) : null

      const url = tgLinkFromEntity(entity, msgId)
      const externalId = `tg:${chatId}:${msgId}`

      events.push({
        source: 'telegram',
        type: 'message',
        externalId,
        occurredAt,
        actorHandle,
        targetHandle,
        url,
        text,
        payload: {
          chatId,
          chatUsername: targetHandle,
          chatTitle: entity?.title ?? null,
          hasLink: hasLink(text),
          isQuestion: looksLikeQuestion(text),
          replyToMsgId: m?.replyTo?.replyToMsgId ?? null
        }
      })
    }

    offsets.chats[String(chatId)] = maxSeen
  }

  writeJson(offsetsPath, offsets)

  await client.disconnect()

  if (events.length === 0) {
    console.log('[tg-user] no matching messages (filters may be too strict).')
    process.exit(0)
  }

  const ingestUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ingest-events`
  const res = await postJson(
    ingestUrl,
    { 'x-ingest-secret': ingestSecret },
    { events, meta: { source: 'telegram-user', chats: watch.watchChatIds.length } }
  )

  if (!res.ok) {
    console.error('[tg-user] ingest failed:', `status=${res.status}`, res.text.slice(0, 600))
    process.exit(1)
  }

  console.log('[tg-user] ok:', res.json || { status: res.status, sent: events.length })
}

await main()


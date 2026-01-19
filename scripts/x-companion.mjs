import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

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

function formatEtParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date)

  const map = new Map(parts.map(p => [p.type, p.value]))
  const hour = Number(map.get('hour') || '0')
  const minute = Number(map.get('minute') || '0')
  return { hour, minute }
}

function inActiveHoursEt(now, startHour = 8, endHour = 22) {
  const { hour, minute } = formatEtParts(now)
  const hm = hour * 60 + minute
  return hm >= startHour * 60 && hm < endHour * 60
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' })
  return {
    ok: res.status === 0,
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? ''
  }
}

function tryParseJson(text) {
  const t = String(text || '').trim()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {
    // Some tools print NDJSON — try line-by-line.
    const lines = t.split('\n').map(l => l.trim()).filter(Boolean)
    const parsed = []
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line))
      } catch {
        return null
      }
    }
    return parsed.length ? parsed : null
  }
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function collectTweetLikes(root, limit = 200) {
  const out = []
  const seen = new Set()

  const stack = [root]
  let steps = 0
  const maxSteps = 20000

  while (stack.length && out.length < limit && steps < maxSteps) {
    steps += 1
    const cur = stack.pop()
    if (!cur) continue

    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i--) stack.push(cur[i])
      continue
    }

    if (!isPlainObject(cur)) continue

    const idRaw = cur.id ?? cur.rest_id ?? cur.tweet_id
    const textRaw = cur.text ?? cur.full_text ?? cur.fullText
    const id = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : ''
    const text = typeof textRaw === 'string' ? textRaw.trim() : ''

    if (id && text) {
      if (!seen.has(id)) {
        seen.add(id)
        out.push(cur)
      }
    }

    for (const v of Object.values(cur)) stack.push(v)
  }

  return out
}

function pickHandle(tweetLike) {
  const u = tweetLike.user || tweetLike.author || tweetLike.core?.user_results?.result?.legacy
  const h =
    (typeof u?.screen_name === 'string' && u.screen_name) ||
    (typeof u?.username === 'string' && u.username) ||
    (typeof u?.handle === 'string' && u.handle) ||
    ''
  return h ? String(h).replace(/^@/, '') : null
}

function pickOccurredAt(tweetLike) {
  const raw = tweetLike.created_at || tweetLike.createdAt || tweetLike.createdAtIso || tweetLike.date
  if (typeof raw === 'string' && raw.trim() && !Number.isNaN(Date.parse(raw))) return raw.trim()
  return new Date().toISOString()
}

function pickText(tweetLike) {
  const raw = tweetLike.full_text || tweetLike.fullText || tweetLike.text
  const t = typeof raw === 'string' ? raw.trim() : ''
  return t ? t.slice(0, 4000) : null
}

function pickId(tweetLike) {
  const idRaw = tweetLike.id || tweetLike.rest_id || tweetLike.tweet_id
  const id = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : ''
  return id || null
}

function pickUrl(tweetLike) {
  const u = tweetLike.url
  if (typeof u === 'string' && u.trim()) return u.trim()
  const id = pickId(tweetLike)
  return id ? `https://x.com/i/status/${id}` : null
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  const txt = await res.text().catch(() => '')
  let parsed = null
  try {
    parsed = txt ? JSON.parse(txt) : null
  } catch {
    parsed = null
  }
  return { ok: res.ok, status: res.status, text: txt, json: parsed }
}

async function main() {
  const cwd = process.cwd()
  const dotEnv = parseDotEnv(readTextIfExists(join(cwd, '.env')))

  const supabaseUrl = getEnv('VITE_SUPABASE_URL', dotEnv)
  const ingestSecret = getEnv('INGEST_SECRET', dotEnv)
  const listIdOrUrl = getEnv('X_LIST_ID_OR_URL', dotEnv)

  const force = String(process.env.FORCE || '').trim() === '1'
  if (!force && !inActiveHoursEt(new Date())) {
    console.log('[x-companion] outside active hours (US/Eastern) — skipping. Set FORCE=1 to run anyway.')
    process.exit(0)
  }

  if (!supabaseUrl) {
    console.error('[x-companion] missing VITE_SUPABASE_URL (set it in .env or env var)')
    process.exit(1)
  }
  if (!ingestSecret) {
    console.error('[x-companion] missing INGEST_SECRET (set it in .env or env var)')
    process.exit(1)
  }
  if (!listIdOrUrl) {
    console.error('[x-companion] missing X_LIST_ID_OR_URL (example: https://x.com/i/lists/123...)')
    process.exit(1)
  }

  const ingestUrl = `${supabaseUrl.replace(/\\/$/, '')}/functions/v1/ingest-events`

  const birdCmd = process.env.BIRD_CMD || 'bird'
  const n = Number(process.env.BIRD_LIMIT || '60')
  const limit = Number.isFinite(n) && n > 0 ? Math.min(200, Math.floor(n)) : 60

  const listRes = run(birdCmd, ['list-timeline', listIdOrUrl, '--json', '-n', String(limit)])
  if (!listRes.ok) {
    console.error('[x-companion] bird list-timeline failed:', listRes.stderr.trim() || `status=${listRes.status}`)
    process.exit(1)
  }

  const mentionsRes = run(birdCmd, ['mentions', '--json', '-n', String(limit)])
  if (!mentionsRes.ok) {
    console.error('[x-companion] bird mentions failed:', mentionsRes.stderr.trim() || `status=${mentionsRes.status}`)
    process.exit(1)
  }

  const listJson = tryParseJson(listRes.stdout)
  const mentionsJson = tryParseJson(mentionsRes.stdout)
  if (!listJson) {
    console.error('[x-companion] failed to parse list-timeline JSON output')
    process.exit(1)
  }
  if (!mentionsJson) {
    console.error('[x-companion] failed to parse mentions JSON output')
    process.exit(1)
  }

  const listTweets = collectTweetLikes(listJson, 200)
  const mentionTweets = collectTweetLikes(mentionsJson, 200)

  const events = []
  for (const t of listTweets) {
    const id = pickId(t)
    if (!id) continue
    events.push({
      source: 'x',
      type: 'tweet',
      externalId: id,
      occurredAt: pickOccurredAt(t),
      actorHandle: pickHandle(t),
      url: pickUrl(t),
      text: pickText(t),
      payload: { feed: 'list', list: listIdOrUrl }
    })
  }
  for (const t of mentionTweets) {
    const id = pickId(t)
    if (!id) continue
    events.push({
      source: 'x',
      type: 'mention',
      externalId: id,
      occurredAt: pickOccurredAt(t),
      actorHandle: pickHandle(t),
      url: pickUrl(t),
      text: pickText(t),
      payload: { feed: 'mentions' }
    })
  }

  if (!events.length) {
    console.log('[x-companion] no events extracted (bird returned 0 tweet-like objects)')
    process.exit(0)
  }

  const res = await postJson(
    ingestUrl,
    { 'x-ingest-secret': ingestSecret },
    { events, meta: { source: 'bird', limit, extracted: { list: listTweets.length, mentions: mentionTweets.length } } }
  )

  if (!res.ok) {
    console.error('[x-companion] ingest failed:', `status=${res.status}`, res.text.slice(0, 600))
    process.exit(1)
  }

  console.log('[x-companion] ok:', res.json || { status: res.status })
}

await main()


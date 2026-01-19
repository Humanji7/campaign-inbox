import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import readline from 'node:readline/promises'
import process from 'node:process'

import { Api, TelegramClient } from 'telegram'
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

function clampText(s, max = 120) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

async function main() {
  const cwd = process.cwd()
  const dotEnv = parseDotEnv(readTextIfExists(join(cwd, '.env')))

  const apiIdRaw = getEnv('TELEGRAM_API_ID', dotEnv)
  const apiHash = getEnv('TELEGRAM_API_HASH', dotEnv)
  const phoneEnv = getEnv('TELEGRAM_PHONE', dotEnv)

  const apiId = Number(apiIdRaw)
  if (!Number.isFinite(apiId) || !apiHash) {
    console.error('[tg-user-setup] missing TELEGRAM_API_ID / TELEGRAM_API_HASH in .env')
    console.error('Get them from https://my.telegram.org → API development tools')
    process.exit(1)
  }

  const sessionPath = join(cwd, '.tg-user.session')
  const sessionString = readTextIfExists(sessionPath)?.trim() || ''
  const stringSession = new StringSession(sessionString)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const phoneNumber =
    phoneEnv || (await rl.question('[tg-user-setup] phone number (international, e.g. +1... or +7...): '))

  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 })

  await client.start({
    phoneNumber: async () => phoneNumber,
    phoneCode: async () => await rl.question('[tg-user-setup] code from Telegram: '),
    password: async () => await rl.question('[tg-user-setup] 2FA password (if enabled): '),
    onError: err => console.error('[tg-user-setup] auth error:', err)
  })

  const outSession = client.session.save()
  writeFileSync(sessionPath, outSession, 'utf8')
  console.log('[tg-user-setup] session saved to .tg-user.session')

  // Create a watch config file if missing.
  const watchPath = join(cwd, '.tg-user-watch.json')
  const defaultWatch = {
    watchChatIds: [],
    triggers: { includeLinks: true, includeQuestions: true, includeTopics: true, includePeople: true, includeAll: false },
    maxPerChat: 40,
    // Safety default: store only short snippets in Supabase (you can increase if needed).
    maxTextLen: 600
  }
  if (!existsSync(watchPath)) {
    writeFileSync(watchPath, JSON.stringify(defaultWatch, null, 2), 'utf8')
    console.log('[tg-user-setup] wrote .tg-user-watch.json (add chat ids you want to monitor)')
  } else {
    try {
      const existing = JSON.parse(readFileSync(watchPath, 'utf8'))
      const merged = {
        ...defaultWatch,
        ...existing,
        triggers: { ...defaultWatch.triggers, ...(existing?.triggers ?? {}) }
      }
      const changed = JSON.stringify(existing) !== JSON.stringify(merged)
      if (changed) {
        writeFileSync(watchPath, JSON.stringify(merged, null, 2), 'utf8')
        console.log('[tg-user-setup] updated .tg-user-watch.json with new defaults (kept your watchChatIds)')
      }
    } catch {
      // leave it as-is if corrupted; user can fix manually.
    }
  }

  console.log('\n[tg-user-setup] dialogs (top 30):')
  const dialogs = await client.getDialogs({ limit: 30 })

  for (const d of dialogs) {
    const entity = d.entity
    const id = entity?.id
    const title = entity?.title || entity?.username || entity?.firstName || entity?.lastName || String(id)
    const username = entity?.username
    const kind =
      entity?.className === 'Channel'
        ? 'channel'
        : entity?.className === 'Chat'
          ? 'group'
          : entity?.className === 'User'
            ? 'dm'
            : 'unknown'

    console.log(`- ${kind.padEnd(7)} id=${id} ${username ? `@${username}` : ''} "${clampText(title)}"`)
  }

  console.log('\nNext:')
  console.log('- Edit `.tg-user-watch.json` and add chat ids into `watchChatIds`.')
  console.log('- Run: `npm run tg:user:once`')

  await client.disconnect()
  rl.close()
}

await main()

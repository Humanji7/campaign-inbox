import { existsSync, readFileSync } from 'node:fs'
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

function clampText(s, max = 80) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

async function main() {
  const cwd = process.cwd()
  const dotEnv = parseDotEnv(readTextIfExists(join(cwd, '.env')))

  const apiIdRaw = getEnv('TELEGRAM_API_ID', dotEnv)
  const apiHash = getEnv('TELEGRAM_API_HASH', dotEnv)
  const apiId = Number(apiIdRaw)
  if (!Number.isFinite(apiId) || !apiHash) {
    console.error('[tg-user-dialogs] missing TELEGRAM_API_ID / TELEGRAM_API_HASH')
    process.exit(1)
  }

  const sessionPath = join(cwd, '.tg-user.session')
  const sessionString = readTextIfExists(sessionPath)?.trim() || ''
  if (!sessionString) {
    console.error('[tg-user-dialogs] missing .tg-user.session. Run: `npm run tg:user:setup`')
    process.exit(1)
  }

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 3 })
  await client.connect()

  const dialogs = await client.getDialogs({ limit: 50 })

  console.log('[tg-user-dialogs] dialogs (top 50):')
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

  await client.disconnect()
}

await main()


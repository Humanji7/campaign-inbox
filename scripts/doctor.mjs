import { readFileSync, existsSync } from 'node:fs'
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

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  return {
    ok: res.status === 0,
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? ''
  }
}

function ok(label, detail = '') {
  console.log(`✅ ${label}${detail ? ` — ${detail}` : ''}`)
}
function warn(label, detail = '') {
  console.log(`⚠️  ${label}${detail ? ` — ${detail}` : ''}`)
}
function fail(label, detail = '') {
  console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`)
  process.exitCode = 1
}

const cwd = process.cwd()

console.log('Campaign Inbox — doctor\n')

// Layer 1: Local app env
const dotEnvPath = join(cwd, '.env')
const localEnv = parseDotEnv(readTextIfExists(dotEnvPath))

const viteUrl = localEnv.get('VITE_SUPABASE_URL')
const viteAnon = localEnv.get('VITE_SUPABASE_ANON_KEY')
if (viteUrl) ok('Local .env has VITE_SUPABASE_URL')
else fail('Local .env missing VITE_SUPABASE_URL', 'Copy `.env.example` → `.env`')

if (viteAnon) ok('Local .env has VITE_SUPABASE_ANON_KEY')
else fail('Local .env missing VITE_SUPABASE_ANON_KEY', 'Copy `.env.example` → `.env`')

if (localEnv.get('SUPABASE_DB_PASSWORD')) ok('Local .env has SUPABASE_DB_PASSWORD (optional)')
else warn('Local .env missing SUPABASE_DB_PASSWORD', 'Only needed for direct DB connections')

// Layer 2: Supabase CLI + project linkage
const cli = run('supabase', ['--version'])
if (!cli.ok) {
  fail('Supabase CLI not available', 'Install `supabase` CLI and retry')
  process.exit(1)
}
ok('Supabase CLI detected', cli.stdout.trim())

const projectRefPath = join(cwd, 'supabase', '.temp', 'project-ref')
const projectRef = readTextIfExists(projectRefPath)?.trim() || null
if (projectRef) ok('Supabase project linked', projectRef)
else warn('Supabase project not linked', 'Run: `supabase link --project-ref <ref>`')

if (!projectRef) {
  console.log('\nNext:\n- Link project: `supabase link --project-ref <ref>`')
  process.exit(process.exitCode ?? 0)
}

// Layer 3: Remote secrets (Edge Functions env)
const secretsJson = run('supabase', ['secrets', 'list', '--project-ref', projectRef, '--output', 'json'])
if (!secretsJson.ok) {
  fail('Failed to list Supabase secrets', secretsJson.stderr.trim() || `status=${secretsJson.status}`)
  process.exit(process.exitCode ?? 0)
}

let secretNames = []
try {
  const parsed = JSON.parse(secretsJson.stdout)
  secretNames = Array.isArray(parsed) ? parsed.map(s => s?.name).filter(Boolean) : []
} catch {
  fail('Failed to parse secrets list', 'Unexpected output from `supabase secrets list`')
}

const secretSet = new Set(secretNames)
const requiredSecrets = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_FACTS_MODEL',
  'LLM_RENDER_MODEL',
  'LLM_MAX_TOKENS'
]

for (const name of requiredSecrets) {
  if (secretSet.has(name)) ok(`Secret set: ${name}`)
  else warn(`Secret missing: ${name}`)
}

// Layer 4: Deployed Edge Function
const fns = run('supabase', ['functions', 'list', '--project-ref', projectRef, '--output', 'json'])
if (!fns.ok) {
  fail('Failed to list deployed functions', fns.stderr.trim() || `status=${fns.status}`)
  process.exit(process.exitCode ?? 0)
}

try {
  const parsed = JSON.parse(fns.stdout)
  const generate = Array.isArray(parsed) ? parsed.find(f => f?.slug === 'generate-cards') : null
  if (generate?.status === 'ACTIVE') ok('Edge Function active: generate-cards', `version=${generate.version ?? 'unknown'}`)
  else warn('Edge Function not active: generate-cards', 'Deploy: `supabase functions deploy generate-cards --project-ref <ref>`')
} catch {
  warn('Could not parse functions list JSON', 'Check `supabase functions list --output pretty`')
}

console.log('\nSmoke test (manual):')
console.log('- Open `http://127.0.0.1:5173` → Packs → Preview commits → Generate cards.')
console.log('- Expect: notice contains `Mode: llm` (not `fallback_no_llm`).')
console.log('- If you see `401 unauthorized`, ensure function setting “Verify JWT with legacy secret” is OFF.')


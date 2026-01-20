# Campaign Inbox → Brand Ops Cockpit

Pull-mode “control plane” for public brand ops: monitor signals, draft a reply/post, jump to the thread, act manually, and track outcomes.

## Stack

- Frontend: Vite + React + TypeScript + Tailwind
- Backend: Supabase (Auth + Postgres + Edge Functions)
- Local companions: scripts that fetch signals and push them to Supabase

## Quick start (local)

1) Install deps
```bash
npm install
```

2) Create `.env`
```bash
cp .env.example .env
```

3) Run checks
```bash
npm test
npm run build
```

4) Run the app
```bash
npm run dev
```

## Cockpit workflow (X/Twitter)

- Fetch signals locally → ingest into Supabase:
  - `FORCE=1 npm run x:companion:once`
- Open `http://127.0.0.1:5173` → **Cockpit**:
  - pick an item → draft → **Copy** → **Open** → reply on X → mark **Done** / **Got reply**

## Ops / Runbooks

- Docs index: `docs/README.md`
- X companion ingest: `docs/runbooks/2026-01-19-x-companion-ingest-runbook.md`
- Supabase Edge + LLM: `docs/runbooks/2026-01-17-supabase-edge-llm-runbook.md`

## Notes

- Never commit secrets: `.env` and local session files are gitignored.
- UI code follows Vercel React/Next performance guidelines in `AGENTS.md`.


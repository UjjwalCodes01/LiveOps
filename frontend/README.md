# Build. Break. Fix. — frontend

Next.js (App Router) frontend for Build. Break. Fix.: a student watches an
AI agent build a real load-balanced AWS system, breaks it, then watches the
agent diagnose and fix it live, narrated through a Socket.IO event stream.
Pairs with the NestJS backend in `../backend` — see that directory's
`README.md` for the API/event-stream side of this.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in real values, see below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The backend
(`../backend`) must be running separately — its default dev port is `4000`,
deliberately different from this app's `3000` so both run locally at once.

## Configuration

All configuration is three `NEXT_PUBLIC_*` environment variables — see
`.env.local.example` for the exact names and what each one means.
`NEXT_PUBLIC_` vars are inlined into the client bundle at **build time**, so
on Vercel they must be set in the project's Environment Variables settings
*before* a build runs, not just in a runtime secret store.

- `NEXT_PUBLIC_API_BASE_URL` — the backend's REST API base (with `/api`).
- `NEXT_PUBLIC_WS_URL` — the backend's Socket.IO origin (no `/api`, no
  namespace).
- `NEXT_PUBLIC_API_KEY` — must match one of the backend's comma-separated
  `API_KEYS`. This is intentionally public — see the comment in
  `.env.local.example` for why that's fine here.

## Build & lint

```bash
npm run build   # next build — includes the TypeScript check
npm run lint     # eslint
npm test         # Vitest unit and contract-drift tests
```

The frontend has Vitest tests for the curriculum, UI helpers, topology, and
the hand-maintained frontend/backend event contract. Run all three commands
before a release or demo.

## Deploy on Vercel

1. Import this repo into Vercel and set the project's **Root Directory** to
   `frontend` (Vercel doesn't build the whole monorepo by default — it
   needs to be told this subfolder is the app). Framework preset
   (Next.js), build command, and output directory are all auto-detected;
   no `vercel.json` is needed.
2. In the project's **Settings → Environment Variables**, set the three
   `NEXT_PUBLIC_*` variables from `.env.local.example` to point at your
   deployed backend (e.g. a Render service — see `../backend/README.md`'s
   Render section). Set them for every environment you'll use
   (Production, Preview, and Development if you run `vercel dev`).
3. Deploy. Every git push gets its own Preview URL in addition to the
   stable Production domain — if the backend's `CORS_ORIGINS` only lists
   the production URL, requests from Preview deployments will be blocked
   by CORS. Add a wildcard entry there (e.g. `https://*.vercel.app`) to
   cover every preview subdomain at once; see `../backend/.env.example`'s
   `CORS_ORIGINS` comment.
4. This app talks to the backend over plain `fetch()` (REST) and a
   `websocket`-only Socket.IO connection — both need the backend reachable
   over HTTPS/WSS from the browser, which Render's default `*.onrender.com`
   domain already provides.

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- `frontend/AGENTS.md` — this repo pins a newer Next.js than most
  documentation/training data reflects; check `node_modules/next/dist/docs/`
  before relying on remembered API shapes.

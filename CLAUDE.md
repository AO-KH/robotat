# CLAUDE.md — ROBOTAT

Guidance for Claude Code when working in this repository. For the full picture see
[`README.md`](README.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What this project is

ROBOTAT (by NASL) is a marketing website **and** customer portal for a company that
sells autonomous agricultural robots (grass cutting, fertilizer/compost spraying,
land cultivation, maintenance). Visitors browse products/services; registered users
book a **site assessment** and track its status. Each booking reaches the business by
**WhatsApp and email**. Full-stack TypeScript web app (originally scaffolded on Replit).

## Tech stack

- **Frontend:** React 18, Vite 7, Wouter (routing), TanStack Query, Tailwind CSS,
  shadcn/ui (Radix primitives), Framer Motion. Font: IBM Plex Sans Arabic + JetBrains Mono.
- **Backend:** Express 5 + TypeScript (run via `tsx`), Passport (local strategy),
  express-session (PG-backed), helmet + express-rate-limit.
- **DB:** PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`).
- **Shared:** Zod schemas + a typed client/server API contract.

## Architecture (important)

- A SINGLE Express server (`server/index.ts`) serves BOTH the API and the client.
  In dev it mounts Vite as middleware; in prod it serves the built static files.
  One process, one port — default **5000** (`PORT` overrides), host `0.0.0.0`.
- `shared/` is the source of truth both sides import: `schema.ts` (Drizzle tables +
  Zod + types) and `routes.ts` (each endpoint's method, path, Zod input, responses).
- Path aliases (in `vite.config.ts` + `tsconfig.json`):
  `@/…` → `client/src/…`, `@shared/…` → `shared/…`, `@assets/…` → `attached_assets/…`.

## Directory map — feature-first on both sides

- `client/src/features/` — `marketing/` (Home, Services, Fleet, not-found),
  `auth/` (Auth page + use-auth), `booking/` (BookDemoModal, DemoModalContext,
  use-assessments), `dashboard/` (Dashboard)
- `client/src/components/layout/` — Navigation, Footer, BackgroundMesh
- `client/src/components/ui/` — shadcn/ui design-system primitives
- `client/src/hooks/` — generic hooks (use-toast, use-mobile); `client/src/lib/` — queryClient, utils
- `server/index.ts` — bootstrap; `server/routes.ts` — mounts the module routers
- `server/lib/` — db, log, errors, notify (email/WhatsApp delivery)
- `server/modules/` — `auth/` (service + storage + routes), `assessments/`, `contact/`, `demo-requests/`
- `server/vite.ts` / `static.ts` — dev (Vite middleware) / prod (static serving)
- `shared/` — schema.ts, routes.ts
- `attached_assets/` — images + a product PDF

Each server module owns `*.storage.ts` (Drizzle queries) + `*.routes.ts` (an Express
`Router`); auth also has `*.service.ts` (session/passport/scrypt, `requireAuth`).

## Commands

- `npm install` — install deps
- `npm run dev` — start dev server (needs `DATABASE_URL`; API + client on port 5000)
- `npm run build` — production build (via `script/build.ts`)
- `npm start` — run production build
- `npm run check` — TypeScript typecheck (tsc)
- `npm run db:push` — push Drizzle schema to the database

## Environment

`server/index.ts` and `drizzle.config.ts` both `import "dotenv/config"`, so a local
`.env` is picked up automatically. `DATABASE_URL` is REQUIRED — the app throws on boot
without it. `.env` is gitignored; see [`.env.example`](.env.example) for all variables
(DB, session secret, SMTP, WhatsApp). Assessment delivery degrades gracefully: email
logs to the console until SMTP is set; WhatsApp always works via a `wa.me` link.

## Current state

Real, PostgreSQL-backed auth and booking:

1. **Auth** — register/login/logout/me via `server/modules/auth/`; scrypt password
   hashing, passport local strategy, PG-backed sessions. `/dashboard` is protected.
   Register/login are rate-limited; `helmet` sets security headers.
2. **Booking** — `server/modules/assessments/` creates bookings tied to the signed-in
   user; the dashboard lists them from `GET /api/assessments`.
3. **Delivery** — each booking reaches the business by WhatsApp (`wa.me` link; optional
   Cloud API) and email (SMTP, or console log in dev). See `server/lib/notify.ts`.
4. `POST /api/contact` builds WhatsApp/email links for guests (no record); legacy
   `POST /api/demo-requests` remains for anonymous lead capture.

Known cleanup: Replit Vite plugins are still in `vite.config.ts` (`@replit/vite-plugin-*`),
inert (gated by `REPL_ID`); schema is deployed via `db:push` (no migration history yet).
See the improvement plan for the roadmap.

## Conventions

- **API contract first.** Add an endpoint to `shared/routes.ts` (method, path, Zod
  input, typed responses), then implement it in the matching `server/modules/<feature>/`
  (storage + routes), and consume it from a `client/src/features/<feature>/` hook.
- **Schema + Zod** live together in `shared/schema.ts`; run `npm run db:push` after
  changing tables.
- **Data fetching** goes through TanStack Query hooks under each feature.

## When starting work

Prefer small, verifiable steps. After code changes run `npm run check`. `tsx` does NOT
hot-reload server code — restart the dev server after backend edits. Don't restructure
the single-server setup or remove the Replit plugins unless asked. Changes are committed
and pushed to GitHub (`AO-KH/robotat`, private) automatically after they're verified.

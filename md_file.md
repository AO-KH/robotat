# CLAUDE.md — ROBOTAT

Guidance for Claude Code when working in this repository.

## What this project is

ROBOTAT (by NASL) is a marketing website + customer portal for a company that
sells autonomous agricultural robots (grass cutting, fertilizer/compost spraying,
land cultivation, maintenance scheduling). It is a full-stack TypeScript web app,
originally scaffolded on Replit. It is NOT a mobile app.

## Tech stack

- Frontend: React 18, Vite 7, Wouter (routing), TanStack Query, Tailwind CSS,
  shadcn/ui (Radix primitives), Framer Motion. Font: "Space Grotesk".
- Backend: Express 5 + TypeScript, run via `tsx`.
- DB: PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`).
- Auth deps present (passport, passport-local, express-session) but NOT yet wired up.

## Architecture (important)

- A SINGLE Express server (`server/index.ts`) serves BOTH the API and the client.
  In dev it mounts Vite as middleware; in prod it serves the built static files.
  There is no separate frontend dev server — one process, one port.
- Default port is **5000** (`PORT` env var overrides). Host `0.0.0.0`.
- Path aliases (defined in `vite.config.ts` and `tsconfig.json`):
  - `@/...`       -> `client/src/...`
  - `@shared/...` -> `shared/...`
  - `@assets/...` -> `attached_assets/...`

## Directory map

Feature-first layout on both sides. See `README.md` and `docs/ARCHITECTURE.md`.

- `client/src/features/`  — marketing/ (Home, Services, Fleet, not-found), auth/ (Auth + use-auth), booking/ (BookDemoModal, DemoModalContext, use-assessments), dashboard/ (Dashboard)
- `client/src/components/layout/` — Navigation, Footer, BackgroundMesh
- `client/src/components/ui/`      — shadcn/ui design-system primitives
- `client/src/hooks/` — generic hooks (use-toast, use-mobile); `client/src/lib/` — queryClient, utils
- `server/index.ts` — bootstrap; `server/routes.ts` — mounts the module routers
- `server/lib/`      — db, log, errors, notify (email/WhatsApp delivery)
- `server/modules/`  — auth/ (service+storage+routes), assessments/, contact/, demo-requests/
- `server/vite.ts` / `static.ts` — dev (Vite middleware) / prod (static serving)
- `shared/`  — schema.ts (Drizzle tables + Zod), routes.ts (typed API contract)
- `attached_assets/` — images + a product PDF

## Commands

- `npm install`      — install deps
- `npm run dev`      — start dev server (needs DATABASE_URL set)
- `npm run build`    — production build (via script/build.ts)
- `npm start`        — run production build
- `npm run check`    — TypeScript typecheck (tsc)
- `npm run db:push`  — push Drizzle schema to the database

## Environment

Create a `.env` (or export in shell). REQUIRED — the app throws on boot without it:

```
DATABASE_URL=postgresql://user:password@localhost:5432/robotat
PORT=5000
```

Note: `server/index.ts` loads `.env` via `import "dotenv/config"` (and so does
`drizzle.config.ts`), so a local `.env` file is picked up automatically. `.env` is
gitignored; see `.env.example` for the full list of variables.

## Current state

Auth and booking are real now (backed by PostgreSQL):

1. Real auth — register/login/logout/me via `server/modules/auth/`, scrypt password
   hashing, passport local strategy, PG-backed sessions. `/dashboard` is protected.
2. Site-assessment booking — `server/modules/assessments/` creates bookings tied to
   the signed-in user; the dashboard lists them from `GET /api/assessments`.
3. Delivery — each booking reaches the business by WhatsApp (`wa.me` link, always on;
   optional Cloud API) and email (SMTP, or a console log in dev). See `server/lib/notify.ts`.
4. Legacy `POST /api/demo-requests` remains for anonymous lead capture.

Still open: Replit-specific Vite plugins are in `vite.config.ts` (`@replit/vite-plugin-*`) —
fine to keep, candidates for removal for local dev.

## Conventions

- The API contract is defined once in `shared/routes.ts` (method, path, Zod input,
  typed responses) and consumed by both server and client. Add new endpoints there
  first, then implement in `server/routes.ts` + `server/storage.ts`.
- DB tables and their Zod insert schemas live in `shared/schema.ts`. After changing
  schema, run `npm run db:push`.
- Frontend data fetching goes through TanStack Query.

## When starting work

Prefer small, verifiable steps. After code changes, run `npm run check` to catch
type errors. Don't remove the Replit plugins or restructure the single-server
setup unless explicitly asked.

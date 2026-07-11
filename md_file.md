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

- `client/src/pages/`  — Home, Services, Fleet, Auth, Dashboard, not-found
- `client/src/components/ui/`     — shadcn/ui components
- `client/src/components/layout/` — Navigation
- `client/src/context/`  — DemoModalContext (global "Book a Demo" modal trigger)
- `server/`  — index.ts (bootstrap), routes.ts, storage.ts, db.ts, vite.ts, static.ts
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

Note: neither `server/index.ts` nor `server/db.ts` currently loads a `.env` file
(no `dotenv` import). Either export the vars in the shell, or add `dotenv` and
import it at the top of `server/index.ts`.

## Current state — this is a PROTOTYPE. Known gaps:

1. Auth is fake. `client/src/pages/Auth.tsx` just redirects to `/dashboard` on
   submit — no real login, no session, no protected routes. Passport is installed
   but there are no auth routes.
2. Dashboard data is hardcoded. `Dashboard.tsx` uses static mock arrays for stats
   and service history — nothing comes from the DB.
3. The only real backend endpoint is `POST /api/demo-requests`. That's the whole API.
4. Replit-specific Vite plugins are still in `vite.config.ts`
   (`@replit/vite-plugin-*`). Fine to keep, but candidates for removal for local dev.

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

# ROBOTAT

Marketing website **and** customer portal for **ROBOTAT** (by NASL) — autonomous
agricultural robots for orchards, row crops, protected agriculture, and solar
sites. Visitors browse the products and services; registered users book a **site
assessment** and track its status. Each booking reaches the business two ways —
**WhatsApp** and **email**.

A single Express server serves both the API and the React client on one port.

## Tech stack

| Layer        | Tech |
|--------------|------|
| Frontend     | React 18, Vite 7, Wouter (routing), TanStack Query, Tailwind CSS, shadcn/ui, Framer Motion |
| Backend      | Express 5 + TypeScript (run via `tsx`), Passport (local strategy), express-session |
| Database     | PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`) |
| Shared       | Zod schemas + a typed API contract used by client **and** server |

## Project structure

```
robotat/
├── client/                     # React SPA (Vite root)
│   └── src/
│       ├── components/
│       │   ├── layout/         # Navigation, Footer, BackgroundMesh
│       │   └── ui/             # shadcn/ui design-system primitives
│       ├── features/           # feature-first modules
│       │   ├── marketing/      #   Home, Services, Fleet, not-found
│       │   ├── auth/           #   Auth page + use-auth hook
│       │   ├── booking/        #   BookDemoModal, DemoModalContext, use-assessments
│       │   └── dashboard/      #   Dashboard page
│       ├── hooks/              # generic hooks (use-toast, use-mobile)
│       ├── lib/                # queryClient, utils
│       ├── App.tsx             # routes + providers
│       └── main.tsx            # entry
│
├── server/                     # Express API + client host
│   ├── index.ts                # bootstrap: middleware, error handler, listen
│   ├── routes.ts               # mounts every module router
│   ├── lib/                    # db, log, errors, notify (email/WhatsApp)
│   ├── modules/                # one folder per feature
│   │   ├── auth/               #   auth.service · auth.storage · auth.routes
│   │   ├── assessments/        #   assessments.storage · assessments.routes
│   │   ├── contact/            #   contact.routes (WhatsApp/email links)
│   │   └── demo-requests/      #   demo-requests.storage · demo-requests.routes
│   ├── vite.ts / static.ts     # dev (Vite middleware) / prod (static files)
│
├── shared/                     # used by BOTH client and server
│   ├── schema.ts               # Drizzle tables + Zod schemas + types
│   └── routes.ts               # typed API contract (method, path, input, responses)
│
├── attached_assets/            # images + product PDF
└── drizzle.config.ts           # Drizzle Kit config
```

Each server module owns three concerns: **`*.storage.ts`** (DB queries),
**`*.routes.ts`** (an Express `Router`), and — for auth — **`*.service.ts`**
(session/passport/password logic). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for how a request flows through these.

## Getting started

**Prerequisites:** Node.js 20+ and PostgreSQL.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # then edit DATABASE_URL etc.

# 3. Create the schema
npm run db:push

# 4. Run the dev server (API + client on http://localhost:5000)
npm run dev
```

### Environment variables

See [`.env.example`](.env.example). `DATABASE_URL` is **required** (the app throws
on boot without it). Assessment delivery is optional and degrades gracefully:
email logs to the console until SMTP is set, and WhatsApp always works via a
`wa.me` click-to-chat link (`WHATSAPP_BUSINESS_NUMBER`), with an optional Cloud
API push when Meta credentials are provided.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev`     | Start the dev server (Vite middleware + API) on port 5000 |
| `npm run build`   | Production build |
| `npm start`       | Run the production build |
| `npm run check`   | TypeScript typecheck |
| `npm run db:push` | Push the Drizzle schema to the database |

## Conventions

- **API contract first.** Add an endpoint to `shared/routes.ts` (method, path, Zod
  input, typed responses), then implement it in the matching `server/modules/*`
  and consume it from a `client/src/features/*` hook.
- **Schema + Zod** live together in `shared/schema.ts`; run `npm run db:push` after
  changing tables.
- **Data fetching** goes through TanStack Query hooks under each feature.
- Path aliases: `@/…` → `client/src/…`, `@shared/…` → `shared/…`, `@assets/…` → `attached_assets/…`.

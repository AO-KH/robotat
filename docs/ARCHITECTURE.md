# Architecture

## Overview

ROBOTAT is a single-process full-stack TypeScript app. **One Express server**
([`server/index.ts`](../server/index.ts)) serves both the JSON API and the React
client. In development it mounts Vite as middleware ([`server/vite.ts`](../server/vite.ts));
in production it serves the built static files ([`server/static.ts`](../server/static.ts)).
There is no separate frontend dev server — one process, one port (default `5000`).

```
                         ┌───────────────────────────────────────────┐
   Browser  ───────────▶ │        Express (server/index.ts)          │
   (React SPA)           │                                           │
        ▲                │   /api/*  ──▶  routes.ts  ──▶  modules/*  │
        │                │                                  │        │
        │  HTML/JS/CSS   │   everything else ──▶ Vite (dev) /│        │
        └──────────────  │                       static (prod)        │
                         │                                  ▼        │
                         │                          lib/db  ──▶ PostgreSQL
                         └───────────────────────────────────────────┘

              shared/  (Zod schema + typed API contract)
              ▲                                        ▲
              └────────── imported by client ──────────┴── and server
```

The **`shared/`** folder is the contract that keeps the two sides honest:
- [`shared/schema.ts`](../shared/schema.ts) — Drizzle tables + Zod validation + inferred TS types.
- [`shared/routes.ts`](../shared/routes.ts) — every endpoint's `method`, `path`, Zod `input`, and typed `responses`.

Both client hooks and server routes import from `shared/`, so a change to a
request/response shape surfaces as a type error on both sides.

## Server: feature modules

`server/routes.ts` wires sessions/passport and mounts one router per feature:

```
registerRoutes(app)
  ├─ setupAuth(app)              # express-session (PG store) + passport
  ├─ authRoutes                  # /api/auth/register · login · logout · me
  ├─ assessmentRoutes            # /api/assessments   (create, list)
  ├─ contactRoutes               # /api/contact       (GET links, POST form → links)
  └─ demoRequestRoutes           # /api/demo-requests (legacy lead capture)
```

Each module under `server/modules/<feature>/` separates concerns:

| File | Responsibility |
|------|----------------|
| `<feature>.routes.ts`   | Express `Router` — validates input, calls storage, shapes the response |
| `<feature>.storage.ts`  | Drizzle queries for that feature's tables |
| `auth.service.ts`       | (auth only) password hashing (scrypt), passport strategy, session setup, `requireAuth` guard |

Shared server infrastructure lives in `server/lib/`:
- `db.ts` — the Drizzle pool + client.
- `log.ts` — the request/console logger.
- `errors.ts` — `handleZodError` (turns a `ZodError` into a `400`).
- `notify.ts` — builds the WhatsApp/email links and delivers bookings to the business.

## Request flows

### Register / login (auth)

```
Auth page ──POST /api/auth/register──▶ authRoutes
  useRegister()                         │  validate (Zod) → getUserByEmail (409 if taken)
  (features/auth/use-auth.ts)           │  hashPassword (scrypt+salt) → createUser
                                        │  req.login() → session cookie set
  ◀───────── PublicUser (no hash) ──────┘
```

`login` runs the passport `local` strategy (`verifyPassword` = constant-time
compare). The session is stored in the `user_sessions` table (connect-pg-simple).
`GET /api/auth/me` returns the current `PublicUser` or `401`.

### Booking a site assessment

```
BookDemoModal (features/booking)
  │
  ├─ "WhatsApp"  ─GET /api/contact─▶ contactRoutes ─▶ wa.me link (personalized if signed in)
  │
  └─ "Email"  ── fills the Individual/Company form ──┐
                                                     ▼
       signed in? ── yes ─▶ POST /api/assessments ─▶ assessmentRoutes
       │                     requireAuth · createAssessment (saved to dashboard)
       │                     deliverAssessment() → email + WhatsApp to the business
       │                     ◀── { assessment, whatsappUrl, mailtoUrl }
       │
       └── no ───▶ POST /api/contact ─▶ contactRoutes ─▶ { whatsappUrl, mailtoUrl }
                     (no record saved)

  → the client then opens the returned mailto:/wa.me link
```

The **dashboard** ([`features/dashboard/Dashboard.tsx`](../client/src/features/dashboard/Dashboard.tsx))
calls `GET /api/assessments` (guarded by `requireAuth`) and lists the signed-in
user's bookings, newest first.

## Data model (`shared/schema.ts`)

```
users                      assessments                     demo_requests
─────                      ───────────                     ─────────────
id            (pk)         id            (pk)              id        (pk)
name                       user_id  ──▶ users.id           name
email  (unique)            name, email, phone              email
password_hash              company, land_size              company
created_at                 location, message               message, land_size
                           status (default 'pending')      location
                           created_at                      created_at

user_sessions              # created automatically by connect-pg-simple
```

Passwords are stored only as a scrypt hash (`<hexhash>.<hexsalt>`); the client
only ever receives `PublicUser` (id, name, email, createdAt) — never the hash.

## Delivery: WhatsApp + email

`server/lib/notify.ts` is the single source for reaching the business:
- **Links** (`buildWhatsappLink`, `buildMailtoLink`) — always available, pre-filled
  with the lead's details; used by both the contact and assessment routes.
- **Server push** (`deliverAssessment`) — on a saved booking, emails the team
  (nodemailer/SMTP, or a console log in dev) and optionally pushes via the
  WhatsApp Cloud API when Meta credentials are set.

Everything degrades gracefully: with zero delivery credentials a booking still
succeeds, the dashboard still records it, and the customer can still reach the
business through the returned `wa.me` / `mailto:` links.

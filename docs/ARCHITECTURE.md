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
registerRoutes(httpServer, app)
  ├─ /api/health · /api/ready    # liveness (no DB) and readiness (SELECT 1)
  ├─ setupAuth(app)              # express-session (PG store) + passport
  ├─ authRoutes                  # /api/auth/*        (register · login · logout · me ·
  │                              #                     reset · verify · token · account)
  ├─ assessmentRoutes            # /api/assessments   (create, list own)
  ├─ adminRoutes                 # /api/admin/*       (staff-only: bookings, users,
  │                              #                     analytics summary)
  ├─ analyticsRoutes             # /api/analytics/events (anonymous event intake)
  ├─ productRoutes               # /api/products      (DB-driven bilingual fleet)
  ├─ contactRoutes               # /api/contact       (GET links, POST form → links)
  └─ pushRoutes                  # /api/push/*        (APNs device token register)
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
users                          auth_tokens                    assessments
─────                          ───────────                    ───────────
id               (pk)          id               (pk)          id               (pk)
name                           user_id  ──▶ users.id          user_id  ──▶ users.id
email            (unique)      kind                             (nullable)
email_canonical  (unique)      token_hash                     name
password_hash                  expires_at                     email
role                           used_at                        phone
email_verified_at              attempts                       company
token_version                  created_at                     land_size
locale                                                        location
created_at                                                    message
                                                              status  (default 'pending')
                                                              locale
                                                              scheduled_at
                                                              created_at

push_tokens                    analytics_events               products
───────────                    ────────────────               ────────
id               (pk)          id               (pk)          id               (pk)
user_id  ──▶ users.id          type                           slug             (unique)
  (cascade delete)             path                           kind
token            (unique)      visitor_id                     sort_order
platform                       user_id  ──▶ users.id          name
created_at                       (set null)                   role_en, role_ar
last_seen_at                   created_at                     description_en, description_ar
                                                              specs            (jsonb)
                                                              created_at

user_sessions                  # created automatically by connect-pg-simple
```

Passwords are stored only as a scrypt hash (`<hexhash>.<hexsalt>`); the client only ever
receives `PublicUser` — `id`, `name`, `email`, `role`, `createdAt` and a derived
`emailVerified` boolean — so the hash, `email_canonical` and `token_version` never leave
the server.

Three of those columns exist for reasons the shape alone does not show. **`email_canonical`**
holds the address with provider-specific aliasing stripped, and carries its own UNIQUE
index (migration `0011`). `email` is unique too, but Gmail ignores dots in the local part
and everything after a `+`, so one mailbox could hold several accounts — and several
accounts is several helpings of the per-account booking cap. The address the customer
typed stays in `email`, because that is the one they recognise.

**`auth_tokens.attempts`** (migration `0010`) is there because email verification is a
6-digit code rather than a link — the right shape for a phone, but only 1,000,000
possibilities, which anyone allowed to keep guessing can walk. The column ends a token
after a handful of wrong guesses; the 32-byte password-reset token in the same table
needs no such limit, and sharing one table is simpler than splitting it for one column.

**`assessments.user_id`** is nullable (migration `0007`) so that deleting an account
detaches its bookings instead of destroying them. An assessment records a site visit
ROBOTAT actually performed — a business fact that outlives the account — so account
deletion (App Store Guideline 5.1.1(v)) nulls the link and anonymises the contact
fields rather than removing the row. `push_tokens` is the exception that cascades: a
device row pointing at a deleted user would eventually be pushed to.

The legacy `demo_requests` table was dropped in migration `0002`; bookings are the one
lead funnel. `POST /api/contact` still serves guests, but it saves no record.

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

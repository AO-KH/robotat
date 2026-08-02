# NASL Backend Standard — ROBOTAT as reference implementation

**Date:** 2026-08-03
**Status:** Approved design, ready for implementation planning

## Context

NASL runs backends across more than one stack. `service-template/` (added to this
repo on 2026-08-03) is a Java 21 / Spring Boot service template derived from the
Marsad module template with Marsad-specific couplings removed. The goal is to make
it the house standard for NASL backends generally — not to convert ROBOTAT to Java.

The obstacle is that `TEMPLATE.md` fuses two different things:

- **A normative core** — roughly fifteen policies that are true regardless of
  language: guard-first on reads, scope-bound finders, guard→mutate→outbox→audit,
  one error envelope, length caps on every string, no production secret defaults,
  idempotent never-edited migrations, denial tests that assert no side effects,
  contract-or-the-build-fails, gated deploy with rollback.
- **One binding of it** — Maven, `@EnableRetry`, JPA, Flyway, springdoc, JaCoCo,
  Testcontainers, `mvn verify` as the definition of done.

Standardizing NASL backends means separating those layers. Java/Spring already has
its binding. TypeScript/Express has none — and ROBOTAT is the natural place to
derive one, because the same work fixes real defects in it.

The Java template was itself extracted from a working service (Marsad) rather than
written speculatively. This design follows that path deliberately: **make ROBOTAT
conformant first, extract the standard from what actually worked.** A standard
written in the abstract tends to describe a service nobody has built.

### Defects this fixes in ROBOTAT

Verified against the code, not assumed:

| Defect | Evidence |
|---|---|
| Notifications are silently lost | `server/modules/admin/admin.routes.ts:41` — `notifyCustomerStatusChange(updated).catch(() => {})`. An SMTP hiccup means the customer is never told their assessment was scheduled, permanently and without a trace. |
| No audit trail whatsoever | Staff change customers' booking statuses with no record of who or when. |
| Unbounded string fields | `message`, `location`, `company` and most other Zod fields have no `.max()`. |
| No transactions anywhere | Zero uses of `db.transaction` in `server/`; every storage function writes directly. |
| Error responses hand-built in 35 places | `res.status(...).json(...)` across six route files, 21 of them in `auth.routes.ts`. |

### Already conformant — leave alone

Sole schema ownership; idempotent, committed, never-edited migrations; fail-fast env
validation with no production secret defaults; non-root Docker image with a
healthcheck; helmet security headers.

## Goals

1. Bring ROBOTAT's backend to Tier A+B conformance (every security- and
   correctness-invariant), module by module.
2. Extract a stack-agnostic invariant core plus a TypeScript/Express binding from
   the result, usable by the next NASL backend.

## Non-goals

- Rewriting ROBOTAT in Java. By the template's own split test
  (`docs/01-architecture-and-boundaries.md` §"When to split out a second service"),
  ROBOTAT's modules are one bounded context and would be feature slices of a single
  service, not separate services.
- Tier C ops work this round — correlation IDs, metrics endpoint, coverage floor,
  CD health-polling and auto-rollback. Deferred because it is where the Java
  template is most Java-specific (actuator, JaCoCo) and therefore transfers least.
- `/internal/**`, `X-Service-Token`, Feign-style peer clients. ROBOTAT has no peer
  services; the invariant is recorded but unexercised.
- Replacing `shared/routes.ts` with OpenAPI. See "Expected divergences".

## Architecture

`server/lib/` is ROBOTAT's equivalent of the template's `common/`. Four primitives
are added or upgraded there.

### `errors.ts` — one error envelope

An `AppError` class carrying `status`, `message` and optional `field`, with
factories `notFound`, `conflict`, `badRequest`, `forbidden`, `unauthorized`,
`internal`. Routes throw; a single handler in `server/app.ts` renders the body.

The response shape stays exactly `{ message, field? }`, so the client's existing
`readError()` in `client/src/features/auth/use-auth.ts` keeps working unchanged.
This is an internal refactor, not an API change. The 35 hand-built responses
collapse into throws.

### `audit.ts` — the missing trail

`audit.log({ actorId, action, resource, resourceId, ip })` writing to
`audit_events`. An audit failure must never fail the request, and must never be
silent either — it logs at error level through the existing pino logger.

### `outbox.ts` — the write-sequence backbone

`outbox.publish(tx, event)` writes a row **inside the caller's transaction**. A
relay started at boot polls pending rows and dispatches them to registered handlers,
incrementing attempts and recording the last error on failure.

In ROBOTAT the outbox consumer *is* the notification system. Two handlers are
registered, both wrapping code that already exists in `server/lib/notify.ts`:
`assessment.created` dispatches `deliverAssessment` (the business notification), and
`assessment.status_changed` dispatches `notifyCustomerStatusChange` (the customer
notification). This converts today's fire-and-forget calls into at-least-once
delivery with retries. Handlers must be idempotent, as at-least-once implies
redelivery.

### `guard.ts` — explicit access

ROBOTAT's scope axis is `userId`. `requireAccess(scopeId, caller)` is the first
statement of every service method, reads included, with staff permitted across
scopes. The scope binding already exists but is *implicit* in query shape
(`getAssessmentForUser(id, userId)`); making it an explicit call is what makes it
reviewable and testable rather than a convention.

### Transactions

Nothing in `server/` uses transactions today. Storage functions that participate in
a write sequence take an optional executor — `(…, tx = db)` — and services wrap the
sequence in `db.transaction()`. Roughly six to eight write functions change; reads
are untouched.

Chosen over an `AsyncLocalStorage` ambient transaction deliberately: an ambient
implementation hides the exact property being standardized. A reviewer must be able
to see that the mutation and the outbox row share a transaction.

### Migration 0006

Creates `outbox_events` and `audit_events`, per the template rule that every schema
baseline creates both. Folded into the same migration: converting existing
`timestamp` columns to `timestamptz`, and adding `CHECK` constraints to status
columns (`assessments.status`, `users.role`, `auth_tokens.kind`, `products.kind`)
in place of bare `text`.

Hand-authored — SQL plus `_journal.json` entry plus `meta/0006_snapshot.json` — per
the established convention in this repo. `db:generate` is not used.

**Housekeeping:** `migrations/0006_push_tokens.sql` is currently untracked, left
from a superseded plan. It gets renumbered out of the way. Push notifications return
later as another outbox consumer, which is a better home for them than a fourth
delivery path bolted onto a fire-and-forget call.

## Module-by-module work

Dependency order. Each module: typecheck and tests green, then commit.

**`auth`** — the largest cleanup. All 21 hand-built error responses become throws;
length caps on every schema field; audit rows for `user.registered`,
`user.login_failed`, `password.changed`, `password.reset`, `email.verified`. No
guard needed (self-scoped by session or bearer token).

**`assessments`** — explicit `requireAccess` at the top of each service method; the
write sequence on create emitting `assessment.created`; caps on the booking payload.

**`admin`** — the highest-value module. The status change becomes
`transaction { update → outbox 'assessment.status_changed' } → audit`, with
`actorId` set to the acting staff user. The `.catch(() => {})` at line 41 disappears
because notify is now an outbox handler. `GET /api/admin/assessments` gains paging.

**`products`** — read-only and public; error envelope only.

**`analytics`** — public ingest; its Zod schema already has `.max()` caps. It *is*
an event log, so it takes no audit rows and publishes no events.

**`contact`** — caps on the guest payload; error envelope.

### Paging

`GET /api/admin/assessments` only — the one list that grows unbounded as the
business takes bookings. Page size clamped at 200 per the template. Customer-facing
lists stay flat arrays, since a user has a handful of assessments and changing them
would churn client components for no benefit. The contract change is made in
`shared/routes.ts` and the admin hook together.

## Testing

The Java template's denial test mocks the repository and asserts
`verifyNoInteractions(repo, outbox, audit)`. ROBOTAT's suite runs against real
Postgres, which allows asserting the stronger, literal invariant: after a forbidden
call, query `assessments`, `outbox_events` and `audit_events` and assert row counts
are unchanged. No write, no event, no audit row.

Per module: happy path, each business rule, and a denial test using that assertion.

One additional test carries most of the weight of this exercise — the outbox relay.
Publish an event, run the relay with a failing handler, and assert attempts
increment while the row stays unprocessed; then run a succeeding handler and assert
it is marked processed. That test is what proves the delivery guarantee that
motivated the work.

## Extraction

After ROBOTAT is green, two documents:

- **`docs/nasl/INVARIANTS.md`** — the stack-agnostic core. Each invariant numbered,
  with its rationale and how to test it, written free of both Java and TypeScript.
- **`docs/nasl/binding-typescript-express.md`** — how each invariant is realized in
  TypeScript, Express, Drizzle and Vitest, citing ROBOTAT files as the reference
  implementation.

### Expected divergences

The most valuable output is where TypeScript satisfies an invariant *differently*
rather than failing it. Two are known already:

1. **Contract enforcement.** The Java binding uses `docs/spec/openapi.yaml` plus an
   `OpenApiContractTest` that fails the build on an undeclared route. ROBOTAT's
   `shared/routes.ts` is stronger — a typed contract enforced at compile time and
   shared by client and server. The invariant is "every route is declared in a
   checked contract and the build fails otherwise", not "keep an OpenAPI file".
2. **Denial tests.** Java proves absence of side effects with mock verification;
   TypeScript proves it with real row counts. The invariant is the absence itself.

A standard that can only be satisfied one way is a framework, not a standard.
Recording these divergences is what makes it portable to the next NASL backend.

## Decisions

| Decision | Choice |
|---|---|
| Purpose of adopting the template | House standard for NASL backends; ROBOTAT is the pilot |
| Deliverable path | Prove on ROBOTAT, then extract — mirrors how the Java template came out of Marsad |
| Pilot scope | Tier A+B (security and correctness); Tier C ops deferred |
| Transaction threading | Explicit optional `tx` parameter on write-path storage functions only |
| Paging | Admin lists only |

## Success criteria

- Every write in ROBOTAT follows guard → mutate → outbox (same transaction) → audit.
- Every service method calls the guard first, reads included.
- No route hand-builds an error response; all throw `AppError`.
- Every string field has a length cap.
- A denial test per module asserts no write, no event and no audit row.
- The relay test demonstrates retry on failure and completion on success.
- Typecheck, the full test suite, and the production build stay green throughout.
- The two extraction documents exist and cite real files.

# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in customer permanently delete their account from inside the app, satisfying App Store Guideline 5.1.1(v), without destroying the business record of assessments ROBOTAT actually performed.

**Architecture:** One transactional storage function does the whole thing: anonymise the user's assessments in place, detach their analytics events, then delete the user row (auth tokens cascade). A migration first drops `assessments.user_id NOT NULL`, because detaching requires nulling it. The endpoint sits behind `requireAuth` and re-verifies the password. The client puts it in Profile behind a typed confirmation.

**Tech Stack:** Express 5, Drizzle ORM (node-postgres), Zod, React 18 + TanStack Query, Vitest + Supertest.

---

## Decisions already made — do not revisit

**Assessments are anonymised, not deleted.** Erasure covers personal data, not the fact that work happened. ROBOTAT dispatched an agronomist to a farm; that record has legitimate business value and may have been invoiced. What must go is everything identifying the person.

**Deletion is immediate**, confirmed by re-entering the password. No grace period — that would need a scheduler this project does not have, plus a "deleted but not purged" state that complicates every auth query.

**`analytics_events.user_id` is nulled, not cascaded.** The event still counts toward funnel totals; it simply stops being attributable to a person.

## Ground truth (verified 2026-08-06 against the live DB)

Foreign keys pointing at `users`:

| Table | Column | Delete rule |
| --- | --- | --- |
| `auth_tokens` | `user_id` | `CASCADE` — already correct, leave alone |
| `assessments` | `user_id` | `NO ACTION` — blocks the delete |
| `analytics_events` | `user_id` | `NO ACTION` — blocks the delete |

Proven by attempting a delete inside a rolled-back transaction:
```
FAILED: 23503 assessments_user_id_users_id_fk
Key (id)=(13) is still referenced from table "assessments".
```

`assessments` columns and their fate:

| Column | Nullable today | After deletion |
| --- | --- | --- |
| `user_id` | **NOT NULL** — must change | `NULL` |
| `name` | NOT NULL | `'[deleted]'` |
| `email` | NOT NULL | `'[deleted]'` |
| `phone`, `company`, `location`, `message` | nullable | `NULL` |
| `land_size`, `status`, `scheduled_at`, `created_at` | — | **kept unchanged** |

`name` and `email` are `NOT NULL`, so they take a literal marker rather than `NULL`. `'[deleted]'` is deliberate: staff looking at the admin list should see that a booking exists and its customer is gone, not a blank that reads as a data bug.

**`message` is scrubbed even though it is not obviously a personal field.** It is user-authored free text — someone may well have typed a phone number or a home address into it. Scrubbing name and email while keeping that would defeat the exercise.

**Migrations here are hand-authored.** Do NOT run `npm run db:generate`. Write the `.sql`, add the `_journal.json` entry, and add `meta/0007_snapshot.json`. Latest is `0006`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `migrations/0007_account_deletion.sql` (create) | Drop the NOT NULL; retarget both FKs to `ON DELETE SET NULL` as a safety net. |
| `migrations/meta/_journal.json` (modify) | Register `0007`. |
| `migrations/meta/0007_snapshot.json` (create) | Drizzle's view of the schema after `0007`. |
| `shared/schema.ts` (modify) | `assessments.userId` becomes nullable; add `deleteAccountSchema`. |
| `shared/routes.ts` (modify) | `api.auth.deleteAccount`. |
| `server/modules/auth/auth.storage.ts` (modify) | `deleteAccountAndAnonymise(userId)` — one transaction. |
| `server/modules/auth/auth.routes.ts` (modify) | `DELETE /api/auth/account`, password re-verified. |
| `client/src/features/auth/use-auth.ts` (modify) | `useDeleteAccount` hook. |
| `client/src/features/auth/Profile.tsx` (modify) | The danger zone UI. |
| `client/src/i18n/en.ts`, `ar.ts` (modify) | Copy, both languages. |
| `test/account-deletion.test.ts` (create) | Integration tests against a real DB. |

---

## Task 1: Migration

**Files:**
- Create: `migrations/0007_account_deletion.sql`
- Modify: `migrations/meta/_journal.json`
- Create: `migrations/meta/0007_snapshot.json`
- Modify: `shared/schema.ts`

- [ ] **Step 1: Write the SQL**

Create `migrations/0007_account_deletion.sql`:

```sql
-- Account deletion (App Store Guideline 5.1.1(v)) requires detaching a user's
-- assessments rather than destroying them: the assessment records work ROBOTAT
-- actually performed and may have invoiced. Detaching means nulling user_id, which
-- the NOT NULL constraint currently forbids.
ALTER TABLE "assessments" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint

-- Both foreign keys are NO ACTION today, so deleting a user throws 23503. The
-- application deletes inside a transaction that nulls these first, so these clauses
-- are a safety net rather than the mechanism — they stop any future code path from
-- being blocked, or worse, from cascading away business records by accident.
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "analytics_events" DROP CONSTRAINT "analytics_events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
```

**Verify the constraint names first** — do not trust the ones above:
```bash
node -e "require('dotenv/config');const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"SELECT conname, conrelid::regclass FROM pg_constraint WHERE confrelid='users'::regclass\").then(r=>{console.table(r.rows);return p.end()})"
```
If a name differs, use the real one and say so in your report.

- [ ] **Step 2: Register it in the journal**

Append to `entries` in `migrations/meta/_journal.json`, matching the existing shape exactly:
```json
    {
      "idx": 7,
      "version": "7",
      "when": 1785500000000,
      "tag": "0007_account_deletion",
      "breakpoints": true
    }
```

- [ ] **Step 3: Write the snapshot**

Copy `migrations/meta/0006_snapshot.json` to `0007_snapshot.json`, then edit:
- give it a fresh `id` (any uuid) and set `prevId` to `0006`'s `id`
- in `assessments.columns.user_id`, set `"notNull": false`
- in both `assessments` and `analytics_events` `foreignKeys`, change `"onDelete"` to `"set null"`

Do this programmatically with Node rather than by hand — these files are large and a hand edit will drift.

- [ ] **Step 4: Update the Drizzle schema to match**

In `shared/schema.ts`, `assessments.userId` drops `.notNull()`:
```ts
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
```
Check whether `analytics_events.userId` needs the same `onDelete` addition and apply it if so.

**This will produce type errors** wherever code assumed `userId` is non-null. Fix them properly — do not cast. Report each one.

- [ ] **Step 5: Apply and verify**

```bash
npm run db:migrate
```
Then re-run the constraint query from Step 1 and confirm both now read `SET NULL`, and:
```bash
node -e "require('dotenv/config');const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"SELECT is_nullable FROM information_schema.columns WHERE table_name='assessments' AND column_name='user_id'\").then(r=>{console.log(r.rows);return p.end()})"
```
Expected: `YES`.

Also apply to the test database so the suite runs — check `.env.test` for how it is addressed.

- [ ] **Step 6: Commit**

```bash
git add migrations shared/schema.ts
git commit -m "feat(db): let a user row be deleted without destroying their bookings"
```

---

## Task 2: Contract and server

**Files:**
- Modify: `shared/schema.ts`, `shared/routes.ts`
- Modify: `server/modules/auth/auth.storage.ts`, `server/modules/auth/auth.routes.ts`

- [ ] **Step 1: Add the input schema**

In `shared/schema.ts`, beside the other auth schemas:
```ts
/** Deleting an account re-verifies the password: it is irreversible and session-only
 *  proof is not enough if someone walks up to an unlocked device. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
```

- [ ] **Step 2: Add the endpoint to the contract**

In `shared/routes.ts`, inside `api.auth`, following the shape of the neighbouring entries exactly:
```ts
    deleteAccount: {
      method: "DELETE",
      path: "/api/auth/account",
      input: deleteAccountSchema,
    },
```
Match whatever response typing the siblings use.

- [ ] **Step 3: Write the storage function**

In `server/modules/auth/auth.storage.ts`. Use the project's existing transaction idiom — check how other multi-statement work is done here before inventing one.

```ts
/**
 * Delete the user, keep the work.
 *
 * An assessment records that ROBOTAT sent an agronomist to a farm — a business fact
 * that survives the customer closing their account, and one that may have been
 * invoiced. So the row stays and everything identifying the person is stripped:
 * user_id detached, name and email replaced with a visible marker (they are NOT NULL,
 * and a blank would read to staff as a data bug rather than a deleted customer), and
 * every free-text or contact column nulled.
 *
 * `message` is scrubbed even though it is not nominally a personal field: it is
 * user-authored free text and routinely contains a phone number or an address.
 *
 * Analytics events keep counting toward funnel totals; they just stop being
 * attributable. Auth tokens cascade via their own foreign key.
 *
 * All in one transaction: a partial deletion would leave a user whose bookings still
 * carry their name, which is the exact state this exists to prevent.
 */
export async function deleteAccountAndAnonymise(userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(assessments)
      .set({
        userId: null,
        name: "[deleted]",
        email: "[deleted]",
        phone: null,
        company: null,
        location: null,
        message: null,
      })
      .where(eq(assessments.userId, userId));

    await tx
      .update(analyticsEvents)
      .set({ userId: null })
      .where(eq(analyticsEvents.userId, userId));

    await tx.delete(users).where(eq(users.id, userId));
  });
}
```

Import whatever is missing. Confirm `analyticsEvents` is the real exported name.

- [ ] **Step 4: Write the route**

In `server/modules/auth/auth.routes.ts`, behind `requireAuth`, following the file's existing patterns for password verification (reuse the same comparison helper `changePassword` uses — do not write a second one) and for session teardown (reuse what `logout` does).

Order matters: verify the password, then delete, then destroy the session and clear the cookie. Return 401 on a wrong password with the same shape as other auth failures.

- [ ] **Step 5: Write the tests**

Create `test/account-deletion.test.ts`, following the existing integration tests' setup and helpers. Cover:

1. **Unauthenticated** → 401.
2. **Wrong password** → 401, and the user still exists afterwards.
3. **Happy path** → 204/200; the `users` row is gone; the session no longer authenticates.
4. **The assessment survives, anonymised** — this is the point of the whole feature. Create a user, book an assessment, delete the account, then assert the row still exists with `user_id` null, `name` and `email` equal to `'[deleted]'`, `phone`/`company`/`location`/`message` null, and **`land_size`, `status`, `created_at` unchanged**.
5. **Analytics detached, not deleted** — an event for that user still exists with a null `user_id`.
6. **Bearer tokens die with the account** — issue a token via `POST /api/auth/token`, delete the account, confirm the token no longer authenticates.

- [ ] **Step 6: Verify and commit**

```bash
npm run check
npm test
```
Paste real output. The suite is 90 tests across 18 files before your additions.

```bash
git add shared server test/account-deletion.test.ts
git commit -m "feat(auth): delete an account without erasing the work it booked"
```

---

## Task 3: Client

**Files:**
- Modify: `client/src/features/auth/use-auth.ts`, `client/src/features/auth/Profile.tsx`
- Modify: `client/src/i18n/en.ts`, `client/src/i18n/ar.ts`

- [ ] **Step 1: Add the hook**

In `use-auth.ts`, following the shape of `useChangePassword`. On success it must call `clearSignedInState(qc)` from `./auth-state` — the same teardown logout uses, which wipes the whole query cache rather than invalidating, so no trace of the deleted user is served to whoever signs in next.

- [ ] **Step 2: Build the danger zone**

In `Profile.tsx`, a `.surface` section below the existing ones. It needs:
- a heading and a plain statement of what will happen — that the account and personal details go immediately and cannot be recovered
- **an honest note that bookings already sent to the ROBOTAT team by WhatsApp and email are not reachable by this action.** Deleting a database row does not reach into anyone's inbox, and the UI must not imply otherwise
- a password field
- a destructive-styled submit that is **disabled until the password field is non-empty**
- on success, redirect to `/` (use the router already in this file)

Follow the house style: `text-body`/`text-label` roles only, `font-normal`/`font-semibold` only, no arbitrary `text-[Npx]`, every control ≥44px, `.surface` for the panel. Guard tests enforce all of these.

- [ ] **Step 3: Copy, both languages**

Add a `profile.delete*` group to `en.ts` and `ar.ts`. English:

| Key | Text |
| --- | --- |
| `deleteTitle` | Delete your account |
| `deleteBody` | This removes your account and personal details immediately. It cannot be undone. |
| `deleteBookingsNote` | Assessments you have already booked stay with our team as a record of the work, with your personal details removed. Messages already sent by WhatsApp or email cannot be recalled. |
| `deletePasswordLabel` | Confirm your password |
| `deleteConfirm` | Delete my account |
| `deleteFailed` | Couldn't delete your account |

Arabic:

| Key | Text |
| --- | --- |
| `deleteTitle` | حذف حسابك |
| `deleteBody` | يؤدي هذا إلى حذف حسابك وبياناتك الشخصية فورًا، ولا يمكن التراجع عنه. |
| `deleteBookingsNote` | تبقى التقييمات التي حجزتها لدى فريقنا كسجلّ للعمل المنجز، مع إزالة بياناتك الشخصية. أما الرسائل المُرسلة عبر واتساب أو البريد الإلكتروني فلا يمكن استرجاعها. |
| `deletePasswordLabel` | أكّد كلمة المرور |
| `deleteConfirm` | حذف حسابي |
| `deleteFailed` | تعذّر حذف الحساب |

- [ ] **Step 4: Verify in the browser**

Register a disposable account through the app's own sign-up form, book an assessment through the booking modal, then delete the account from Profile. Confirm: wrong password is rejected with a visible error; the correct password deletes and redirects; signing in again with those credentials fails.

Then check the database directly — the assessment row must still be there, anonymised. Paste the row.

Check the danger zone at **375px in both EN and AR**, and confirm the guard tests still pass.

- [ ] **Step 5: Verify and commit**

```bash
npm run check
npm test
npm run build
```

```bash
git add client
git commit -m "feat(auth): let a customer delete their account from Profile"
```

---

## Done When

- A signed-in customer can delete their account from inside the app, satisfying Guideline 5.1.1(v).
- Deleting an account leaves its assessments in place with `user_id` null, `name`/`email` as `'[deleted]'`, contact and free-text columns null, and `land_size`/`status`/`scheduled_at`/`created_at` untouched — **demonstrated against a real database, not asserted**.
- Analytics events survive with a null `user_id`.
- A wrong password does not delete anything.
- Session and bearer tokens both stop working immediately.
- `npm run check`, `npm test` and `npm run build` are green, with the type-scale, weight, tap-target and hidden-content guards all passing.
- Both EN and AR render correctly at 375px.

## Explicitly not done

No grace period or restore window. No admin-initiated deletion of another user's account. No export-my-data endpoint — a separate right under PDPL/GDPR, and a separate piece of work. Existing WhatsApp and email messages are untouched and the UI says so plainly rather than implying otherwise.

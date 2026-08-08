import nodemailer from "nodemailer";
import type { Assessment } from "@shared/schema";
import { log } from "./log";
import {
  bookingConfirmationMessage,
  businessBookingTemplateParams,
  customerStatusMessage,
  customerStatusTemplateParams,
} from "./messages";

// Re-exported so the many modules and tests already importing these from notify.ts
// keep working. They live in ./messages now — see the note there on the import
// cycle between this module and ./apns that the split removes.
export {
  bookingConfirmationMessage,
  businessBookingTemplateParams,
  customerStatusMessage,
  customerStatusPush,
  customerStatusTemplateParams,
  passwordResetMessage,
  emailVerificationMessage,
} from "./messages";
import {
  apnsConfigured,
  buildApnsPayload,
  deadTokens,
  sendApnsNotifications,
  type ApnsTransport,
} from "./apns";
import { deleteTokensByValue, getTokensForUser } from "../modules/push/push.storage";

/**
 * Where booking notices go when ASSESSMENT_INBOX is unset.
 *
 * A guess at a plausible company address, not a mailbox known to exist — which is why
 * notifyConfigWarnings() flags relying on it in production.
 */
const FALLBACK_ASSESSMENT_INBOX = "assessments@nasl-tech.com";

/**
 * Stand-in WhatsApp number used when WHATSAPP_BUSINESS_NUMBER is unset.
 *
 * Not a real line. It keeps the click-to-chat link well-formed in development;
 * notifyConfigWarnings() flags it if it survives into a live Cloud API setup.
 */
const PLACEHOLDER_WHATSAPP_NUMBER = "966500000000";

/**
 * Delivery of new assessment bookings to the business, two ways:
 *   1. Email  — via SMTP when SMTP_* env vars are set, otherwise logged to console.
 *   2. WhatsApp — a wa.me click-to-chat link is always returned for the user to
 *      confirm on; if WhatsApp Cloud API creds are set, a message is also pushed
 *      server-side to the business number.
 *
 * Everything degrades gracefully: with no credentials the booking still succeeds,
 * the email body is logged, and the WhatsApp link still works.
 */

/** A booking lead — any subset of fields (a full Assessment satisfies this too). */
export interface Lead {
  id?: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  landSize?: string | null;
  location?: string | null;
  message?: string | null;
}

/** Business-facing notification body (used for the email/WhatsApp we send our team). */
function summaryLines(a: Assessment): string[] {
  return [
    `New site assessment request #${a.id}`,
    ``,
    `Name:     ${a.name}`,
    `Email:    ${a.email}`,
    a.phone ? `Phone:    ${a.phone}` : ``,
    a.company ? `Company:  ${a.company}` : ``,
    a.landSize ? `Land:     ${a.landSize} ha` : ``,
    a.location ? `Location: ${a.location}` : ``,
    a.message ? `Message:  ${a.message}` : ``,
  ].filter(Boolean);
}

/** User-voice message — this is what the customer sends us via WhatsApp/email. */
function userMessage(lead: Lead): string {
  const lines = ["Hi ROBOTAT 👋 I'd like to book a site assessment for my farm.", ""];
  if (lead.name) lines.push(`Name: ${lead.name}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (lead.phone) lines.push(`Phone: ${lead.phone}`);
  if (lead.company) lines.push(`Company: ${lead.company}`);
  if (lead.landSize) lines.push(`Land size: ${lead.landSize} ha`);
  if (lead.location) lines.push(`Location: ${lead.location}`);
  if (lead.message) lines.push(`Message: ${lead.message}`);
  return lines.join("\n");
}

/** Digits-only phone number for the business WhatsApp line (env-configured). */
function businessWhatsappNumber(): string {
  return (process.env.WHATSAPP_BUSINESS_NUMBER || PLACEHOLDER_WHATSAPP_NUMBER).replace(/[^\d]/g, "");
}

/** Build a wa.me deep link that opens WhatsApp with the booking pre-filled. */
export function buildWhatsappLink(lead: Lead): string {
  return `https://wa.me/${businessWhatsappNumber()}?text=${encodeURIComponent(userMessage(lead))}`;
}

/** Build a mailto: link that opens the user's email client, pre-addressed to the team. */
export function buildMailtoLink(lead: Lead): string {
  const to = process.env.ASSESSMENT_INBOX || FALLBACK_ASSESSMENT_INBOX;
  const subject = lead.name ? `Site assessment request — ${lead.name}` : "Site assessment request";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(userMessage(lead))}`;
}

async function sendEmail(a: Assessment): Promise<void> {
  const { ASSESSMENT_INBOX } = process.env;
  const to = ASSESSMENT_INBOX || FALLBACK_ASSESSMENT_INBOX;
  const body = summaryLines(a).join("\n");

  await deliverEmail({
    to,
    replyTo: a.email,
    subject: `New site assessment request — ${a.name}`,
    text: body,
    context: `assessment #${a.id}`,
  });
}

/**
 * Confirm to the customer that their booking arrived.
 *
 * `replyTo` is the business inbox, not `a.email`. The business notice sets reply-to to
 * the customer so staff can answer them; copying that pattern here would point the
 * customer's reply back at themselves, and the message explicitly invites a reply to
 * correct a wrong phone number.
 */
async function sendCustomerConfirmation(a: Assessment): Promise<void> {
  // The column is NOT NULL, but this also runs for rows built by callers rather than by
  // the insert, and a confirmation to nobody would throw inside the SMTP client.
  if (!a.email) return;

  const { subject, body } = bookingConfirmationMessage(a);
  await deliverEmail({
    to: a.email,
    replyTo: process.env.ASSESSMENT_INBOX || FALLBACK_ASSESSMENT_INBOX,
    subject,
    text: body,
    context: `confirmation for assessment #${a.id}`,
  });
}

/**
 * The address customers see in `From:`.
 *
 * Separate from SMTP_USER, which is a login credential and only doubles as a sender by
 * coincidence of Gmail using an address for both. A transactional provider does not:
 * Resend authenticates as `resend`, Brevo and Postmark issue a username or an API key,
 * and none of those is something a customer should see at the top of their inbox.
 *
 * Accepts a display name too — `MAIL_FROM="ROBOTAT <hello@nasl-tech.com>"` — which
 * nodemailer passes through as-is.
 *
 * The fallback chain keeps today working: unset, it is SMTP_USER exactly as before.
 */
export function mailFrom(env: NodeJS.ProcessEnv = process.env): string {
  return env.MAIL_FROM || env.SMTP_USER || "robotat@nasl-tech.com";
}

/**
 * The one place mail leaves this process.
 *
 * Every send went through its own `createTransport` + `sendMail` pair, which meant a
 * change like MAIL_REDIRECT_TO had to be remembered in three places — and forgetting
 * one is invisible until a customer receives something they should not have.
 *
 * ## MAIL_REDIRECT_TO
 *
 * Set it and every message goes there instead of to its real recipient, with the
 * intended address prefixed onto the subject so an inbox full of redirected mail is
 * still readable. It exists so a live SMTP setup can be exercised end to end without
 * sending anything to a real customer.
 *
 * It is refused outright in production (see validateProduction in ./env). There is no
 * legitimate production use: it would mean every customer silently stops receiving
 * their booking confirmations while the logs still read "sent".
 */
async function deliverEmail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  /** For the log line, so it says what happened rather than what was asked for. */
  context: string;
}): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_REDIRECT_TO } = process.env;

  const redirected = Boolean(MAIL_REDIRECT_TO);
  const to = MAIL_REDIRECT_TO || opts.to;
  // ASCII "->" rather than an arrow glyph: one non-ASCII character forces the whole
  // Subject header into MIME quoted-printable, which makes an inbox of redirected
  // mail unsearchable in its raw form.
  const subject = redirected ? `[-> ${opts.to}] ${opts.subject}` : opts.subject;

  if (!SMTP_HOST) {
    log(`[email:dev] would send to ${to} — ${subject}\n${opts.text}`, "notify");
    return;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transport.sendMail({
    from: mailFrom(),
    to,
    replyTo: opts.replyTo,
    subject,
    text: opts.text,
  });

  // Says "redirected to", not "sent to", so a log cannot be misread as the customer
  // having received it.
  log(
    redirected
      ? `[email] ${opts.context} redirected to ${to} (intended ${opts.to})`
      : `[email] ${opts.context} sent to ${to}`,
    "notify",
  );
}

async function sendWhatsappCloudApi(a: Assessment): Promise<void> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID } = process.env;
  const to = businessWhatsappNumber();
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    log(`[whatsapp:dev] Cloud API not configured; click-to-chat link still available`, "notify");
    return;
  }

  const template = process.env.WHATSAPP_BOOKING_TEMPLATE;

  /*
    A template when one is configured, plain text otherwise — the same trade-off as
    whatsappCustomer(), and for the same reason.

    This alert is business-initiated: nobody messaged the ROBOTAT number to ask for it.
    Meta only delivers plain text inside the 24-hour window a recipient's own last
    message opens, so unless someone happened to WhatsApp the business number within
    the last day, the text path fails with error 131047 and the alert never arrives —
    while the booking itself succeeds and the email still lands. Text stays as the
    fallback because it needs no Meta approval, which keeps local development workable.
  */
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: [
            {
              type: "body",
              parameters: businessBookingTemplateParams(a).map((text) => ({ type: "text", text })),
            },
          ],
        },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: summaryLines(a).join("\n") } };

  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    log(`[whatsapp] Cloud API error ${res.status}: ${detail}`, "notify");
  } else {
    log(`[whatsapp] assessment #${a.id} pushed to ${to}`, "notify");
  }
}

/**
 * Turn a rejection into something someone can act on without a debugger.
 *
 * Node's transport errors carry the interesting part in `code` — ECONNREFUSED,
 * EAUTH, ETIMEDOUT — and the message alone often reads as generic prose that could
 * mean a dozen different misconfigurations.
 */
function describeError(reason: unknown): string {
  if (reason instanceof Error) {
    const { code } = reason as NodeJS.ErrnoException;
    return code ? `${reason.message} [${code}]` : reason.message;
  }
  return typeof reason === "string" ? reason : JSON.stringify(reason);
}

/**
 * Run every channel independently and say so, loudly, when one of them does not arrive.
 *
 * The isolation is the point and it is not negotiable: one channel failing must not stop
 * the others, so this is `allSettled` rather than `all`. What was missing was any trace
 * of the failures. The results were awaited and dropped on the floor, `deliverEmail` only
 * logged *after* a successful `sendMail`, and both callers add `.catch(() => {})` — which
 * also suppresses the unhandled-rejection warning Node would otherwise print. Point
 * SMTP_HOST at a closed port and both sends failed with ECONNREFUSED while the log
 * emitted nothing at all.
 *
 * That is the worst shape a failure can take for this business. A wrong SMTP password, an
 * expired WhatsApp token or an exhausted provider quota looks exactly like a healthy
 * system from every side that is visible: the customer gets their 201, the booking is in
 * the dashboard, the status page is green. The only symptom is that the company stops
 * hearing about bookings — and for a funnel whose entire premise is "every booking reaches
 * us by email and WhatsApp", nobody finds out until a customer asks why no one called.
 *
 * Each channel is named, so the log line says which one to go and fix, and carries the
 * assessment reference, so it can be tied to the booking that did not arrive.
 *
 * Still best-effort: nothing here rethrows, so a delivery failure cannot become a request
 * failure by way of being reported.
 */
async function deliverAll(context: string, channels: Record<string, Promise<void>>): Promise<void> {
  const names = Object.keys(channels);
  const results = await Promise.allSettled(Object.values(channels));

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      log(`[delivery] ${names[i]} FAILED for ${context}: ${describeError(result.reason)}`, "notify");
    }
  });
}

/** Fire both delivery channels; never throws (a delivery failure must not fail the booking). */
export async function deliverAssessment(a: Assessment): Promise<void> {
  await deliverAll(`assessment #${a.id}`, {
    "business email": sendEmail(a),
    "customer confirmation email": sendCustomerConfirmation(a),
    "business whatsapp": sendWhatsappCloudApi(a),
  });
}

/* ============================================================
 * Customer-facing status notifications
 * ========================================================== */

async function emailCustomer(a: Assessment): Promise<void> {
  const { subject, body } = customerStatusMessage(a);
  // SMTP config is read inside deliverEmail, which is the only sender.

  await deliverEmail({
    to: a.email,
    subject,
    text: body,
    context: `status notice for #${a.id} (${a.status})`,
  });
}

async function whatsappCustomer(a: Assessment): Promise<void> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID || !a.phone) {
    log(`[whatsapp:dev] customer status notice skipped (needs Cloud API creds + phone)`, "notify");
    return;
  }
  const to = a.phone.replace(/[^\d]/g, "");
  const template = process.env.WHATSAPP_STATUS_TEMPLATE;

  /*
    A template when one is configured, plain text otherwise.

    Text only reaches the customer inside the 24-hour window their own last message
    opened. A status change is business-initiated and usually falls outside it, so in
    production the text path fails with error 131047 and the customer hears nothing.
    The template path is the one that actually delivers.

    Text is kept as the fallback because it needs no Meta approval, which makes local
    development and staging workable without a registered template. Anywhere real,
    set WHATSAPP_STATUS_TEMPLATE — see the warning in checkNotifyConfig().
  */
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: [
            {
              type: "body",
              parameters: customerStatusTemplateParams(a).map((text) => ({ type: "text", text })),
            },
          ],
        },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: customerStatusMessage(a).body } };

  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    log(`[whatsapp] customer notice error ${res.status}: ${await res.text()}`, "notify");
  } else {
    log(`[whatsapp] status notice for #${a.id} pushed to ${to}`, "notify");
  }
}

/**
 * Push the status change to every iOS device the customer has registered.
 *
 * This is the notification that actually reaches someone: email lands in a folder and
 * WhatsApp needs an approved template, but a push arrives on the lock screen of the
 * phone the booking was made on. It is also the concrete answer to App Review
 * Guideline 4.2 — the app does something the website cannot.
 *
 * `transport` is injectable for tests; production always uses the real http2 one.
 */
export async function pushCustomer(a: Assessment, transport?: ApnsTransport): Promise<void> {
  /*
    An assessment can legitimately have no owner.

    Account deletion anonymises bookings rather than deleting them — the business still
    needs its record of the visit — so `assessments.user_id` is nullable and is set to
    NULL when the customer leaves. There is nobody to notify, and looking up tokens for
    a null user id would be a type error at best and a query for user 0 at worst.
  */
  if (a.userId == null) {
    log(`[apns] assessment #${a.id} has no owner (deleted account) — nothing to push`, "notify");
    return;
  }

  // Checked before the database is touched: unconfigured is the normal state in dev
  // and in the test suite, and it should cost nothing.
  if (!apnsConfigured()) {
    log(`[apns:dev] not configured; would push status "${a.status}" for #${a.id}`, "notify");
    return;
  }

  /*
    APNs, and therefore only the iOS rows.

    `getTokensForUser` is a general accessor and `registerPushTokenSchema` already
    accepts "android" and "web", so the day a second platform registers, an FCM token
    posted to Apple would come back `BadDeviceToken` — which `deadTokens` treats as
    proof the device is gone and silently deletes. The filter belongs here, in the
    Apple-specific sender, not in the accessor an Android fan-out would want to reuse.
  */
  const tokens = (await getTokensForUser(a.userId)).filter((t) => t.platform === "ios");
  if (tokens.length === 0) {
    log(`[apns] no registered iOS devices for assessment #${a.id}`, "notify");
    return;
  }

  const results = await sendApnsNotifications(
    tokens.map((t) => t.token),
    buildApnsPayload(a),
    transport,
  );

  /*
    Prune what Apple says is gone.

    A token for a deleted app never becomes valid again, so leaving it in the table
    means every future status change pays for a doomed request, forever, for a device
    that no longer exists. APNs reports this once and expects us to act on it.
  */
  const dead = deadTokens(results);
  if (dead.length > 0) {
    await deleteTokensByValue(dead);
    log(`[apns] pruned ${dead.length} dead device token(s) after #${a.id}`, "notify");
  }

  const delivered = results.filter((r) => r.ok).length;
  log(`[apns] status notice for #${a.id} delivered to ${delivered}/${results.length} device(s)`, "notify");
}

/** Notify the customer their booking changed status. Best-effort; never throws. */
export async function notifyCustomerStatusChange(a: Assessment): Promise<void> {
  await deliverAll(`status "${a.status}" on #${a.id}`, {
    "customer email": emailCustomer(a),
    "customer whatsapp": whatsappCustomer(a),
    "customer push": pushCustomer(a),
  });
}

/**
 * Warn at boot about delivery configuration that looks live but will not deliver.
 *
 * Every send path here is best-effort and swallows its errors, which is right for a
 * notification — a failed WhatsApp message must not fail a booking. The cost is that
 * a misconfiguration is invisible: WhatsApp credentials with no template send plain
 * text that Meta rejects outside the 24-hour window, and nobody finds out because the
 * failure is a log line on a server no one is reading.
 *
 * Returns the warnings rather than logging them directly so this stays testable.
 */
export function notifyConfigWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  const whatsappLive = Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);

  if (whatsappLive && !env.WHATSAPP_STATUS_TEMPLATE) {
    warnings.push(
      "WHATSAPP_STATUS_TEMPLATE is not set. Customer status notices will be sent as plain " +
        "text, which Meta only delivers inside the 24-hour window opened by the customer's " +
        "own last message. Outside it they fail with error 131047 and the customer is never " +
        "told their visit was scheduled. Register a template in the WhatsApp Manager and set " +
        "its name here.",
    );
  }
  if (whatsappLive && !env.WHATSAPP_BOOKING_TEMPLATE) {
    warnings.push(
      "WHATSAPP_BOOKING_TEMPLATE is not set. New-booking alerts to the business number " +
        "will be sent as plain text, which Meta only delivers inside the 24-hour window a " +
        "recipient's own last message opens. Nobody messages the business line to ask for " +
        "its own alerts, so that window is normally shut and the alert fails with error " +
        "131047 — while the booking succeeds and the email still arrives, so nothing looks " +
        "wrong. Register a template in the WhatsApp Manager and set its name here.",
    );
  }
  if (whatsappLive && (env.WHATSAPP_BUSINESS_NUMBER || PLACEHOLDER_WHATSAPP_NUMBER) === PLACEHOLDER_WHATSAPP_NUMBER) {
    warnings.push(
      `WHATSAPP_BUSINESS_NUMBER is still the placeholder ${PLACEHOLDER_WHATSAPP_NUMBER}, which ` +
        "is not a real line. Cloud API credentials are set, so booking alerts are being sent — " +
        "to nobody. Set it to the number that should receive them, in full international form.",
    );
  }
  if (env.WHATSAPP_TOKEN && !env.WHATSAPP_PHONE_ID) {
    warnings.push("WHATSAPP_TOKEN is set but WHATSAPP_PHONE_ID is not — WhatsApp delivery is off.");
  }
  if (env.WHATSAPP_PHONE_ID && !env.WHATSAPP_TOKEN) {
    warnings.push("WHATSAPP_PHONE_ID is set but WHATSAPP_TOKEN is not — WhatsApp delivery is off.");
  }
  if (env.MAIL_REDIRECT_TO) {
    warnings.push(
      `MAIL_REDIRECT_TO is set: every email goes to ${env.MAIL_REDIRECT_TO} instead of its ` +
        "real recipient. Customers are receiving nothing. Unset it when you are done testing.",
    );
  }
  if (env.NODE_ENV === "production" && !env.SMTP_HOST) {
    warnings.push("SMTP_HOST is not set in production — customer emails will only be logged.");
  }
  /*
    Unset, new bookings are mailed to a hardcoded fallback address. If nobody owns that
    mailbox the notice bounces somewhere nobody reads, while the send itself succeeds and
    logs "sent" — so the business stops hearing about bookings and has no signal that it
    has. The customer's own confirmation is unaffected, which is what makes it easy to
    miss: the funnel looks healthy from the outside.
  */
  if (env.NODE_ENV === "production" && !env.ASSESSMENT_INBOX) {
    warnings.push(
      `ASSESSMENT_INBOX is not set, so new bookings are being mailed to ${FALLBACK_ASSESSMENT_INBOX}. ` +
        "Unless someone actually reads that mailbox, nobody is being told a booking came in — " +
        "and because the send succeeds, the logs will still say the notice went out.",
    );
  }

  /*
    APNs needs all three of team id, key id and signing key. Two out of three is the
    dangerous state: it looks configured to whoever set it, but `apnsConfigured()` is
    false, so every push is skipped with a debug-level log line and the iOS app quietly
    never notifies anyone. Nothing configured at all is fine — that is dev and test.
  */
  const apnsKeys = ["APNS_TEAM_ID", "APNS_KEY_ID", "APNS_PRIVATE_KEY"] as const;
  const missingApns = apnsKeys.filter((k) => !env[k]);
  if (missingApns.length > 0 && missingApns.length < apnsKeys.length) {
    warnings.push(
      `APNs is only partially configured — ${missingApns.join(", ")} ` +
        `${missingApns.length === 1 ? "is" : "are"} missing, so iOS push notifications are ` +
        `switched off entirely. Set all of ${apnsKeys.join(", ")} or none of them.`,
    );
  }

  return warnings;
}

/** Log the above. Called once at boot. */
export function checkNotifyConfig(): void {
  for (const warning of notifyConfigWarnings()) log(`[notify:config] ${warning}`, "notify");
}

/* ============================================================
 * Account emails — password reset & email verification
 * ========================================================== */

/** Send a transactional email to a user. Degrades to a console log when SMTP is unset. */
export async function sendUserEmail(to: string, subject: string, body: string): Promise<void> {
  // SMTP config is read inside deliverEmail, which is the only sender.

  await deliverEmail({ to, subject, text: body, context: `"${subject}"` });
}

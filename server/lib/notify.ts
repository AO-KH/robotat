import nodemailer from "nodemailer";
import type { Assessment } from "@shared/schema";
import { log } from "./log";
import { customerStatusMessage, customerStatusTemplateParams } from "./messages";

// Re-exported so the many modules and tests already importing these from notify.ts
// keep working. They live in ./messages now — see the note there on the import
// cycle between this module and ./apns that the split removes.
export {
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
  return (process.env.WHATSAPP_BUSINESS_NUMBER || "966500000000").replace(/[^\d]/g, "");
}

/** Build a wa.me deep link that opens WhatsApp with the booking pre-filled. */
export function buildWhatsappLink(lead: Lead): string {
  return `https://wa.me/${businessWhatsappNumber()}?text=${encodeURIComponent(userMessage(lead))}`;
}

/** Build a mailto: link that opens the user's email client, pre-addressed to the team. */
export function buildMailtoLink(lead: Lead): string {
  const to = process.env.ASSESSMENT_INBOX || "assessments@nasl-tech.com";
  const subject = lead.name ? `Site assessment request — ${lead.name}` : "Site assessment request";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(userMessage(lead))}`;
}

async function sendEmail(a: Assessment): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ASSESSMENT_INBOX } = process.env;
  const to = ASSESSMENT_INBOX || "assessments@nasl-tech.com";
  const body = summaryLines(a).join("\n");

  if (!SMTP_HOST) {
    log(`[email:dev] would send to ${to}:\n${body}`, "notify");
    return;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transport.sendMail({
    from: SMTP_USER || "robotat@nasl-tech.com",
    to,
    replyTo: a.email,
    subject: `New site assessment request — ${a.name}`,
    text: body,
  });
  log(`[email] assessment #${a.id} sent to ${to}`, "notify");
}

async function sendWhatsappCloudApi(a: Assessment): Promise<void> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID } = process.env;
  const to = businessWhatsappNumber();
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    log(`[whatsapp:dev] Cloud API not configured; click-to-chat link still available`, "notify");
    return;
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: summaryLines(a).join("\n") },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    log(`[whatsapp] Cloud API error ${res.status}: ${detail}`, "notify");
  } else {
    log(`[whatsapp] assessment #${a.id} pushed to ${to}`, "notify");
  }
}

/** Fire both delivery channels; never throws (a delivery failure must not fail the booking). */
export async function deliverAssessment(a: Assessment): Promise<void> {
  await Promise.allSettled([sendEmail(a), sendWhatsappCloudApi(a)]);
}

/* ============================================================
 * Customer-facing status notifications
 * ========================================================== */

async function emailCustomer(a: Assessment): Promise<void> {
  const { subject, body } = customerStatusMessage(a);
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST) {
    log(`[email:dev] would notify ${a.email} — ${subject}\n${body}`, "notify");
    return;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transport.sendMail({
    from: SMTP_USER || "robotat@nasl-tech.com",
    to: a.email,
    subject,
    text: body,
  });
  log(`[email] status notice for #${a.id} (${a.status}) sent to ${a.email}`, "notify");
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

  const tokens = await getTokensForUser(a.userId);
  if (tokens.length === 0) {
    log(`[apns] no registered devices for assessment #${a.id}`, "notify");
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
  await Promise.allSettled([emailCustomer(a), whatsappCustomer(a), pushCustomer(a)]);
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
  if (env.WHATSAPP_TOKEN && !env.WHATSAPP_PHONE_ID) {
    warnings.push("WHATSAPP_TOKEN is set but WHATSAPP_PHONE_ID is not — WhatsApp delivery is off.");
  }
  if (env.WHATSAPP_PHONE_ID && !env.WHATSAPP_TOKEN) {
    warnings.push("WHATSAPP_PHONE_ID is set but WHATSAPP_TOKEN is not — WhatsApp delivery is off.");
  }
  if (env.NODE_ENV === "production" && !env.SMTP_HOST) {
    warnings.push("SMTP_HOST is not set in production — customer emails will only be logged.");
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

const SIGN = "\n\n— ROBOTAT by NASL";

/** Send a transactional email to a user. Degrades to a console log when SMTP is unset. */
export async function sendUserEmail(to: string, subject: string, body: string): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST) {
    log(`[email:dev] would send to ${to} — ${subject}\n${body}`, "notify");
    return;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transport.sendMail({ from: SMTP_USER || "robotat@nasl-tech.com", to, subject, text: body });
  log(`[email] "${subject}" sent to ${to}`, "notify");
}

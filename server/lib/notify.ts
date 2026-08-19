import nodemailer from "nodemailer";
import net from "node:net";
import { promises as dnsPromises } from "node:dns";
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

/**
 * Help channels for the /support page.
 *
 * Deliberately not the booking builders above: those open with "I'd like to book a
 * site assessment", which is the wrong thing to put in the mouth of someone writing
 * in because they cannot sign in.
 *
 * Unlike FALLBACK_ASSESSMENT_INBOX this default is a real published address — it is
 * already on the home page and in the privacy policy — so it needs no config warning.
 */
const FALLBACK_SUPPORT_INBOX = "info@nasl-tech.com";

export function buildSupportLinks(lead: Lead = {}): {
  email: string;
  whatsappUrl: string;
  mailtoUrl: string;
} {
  const email = process.env.SUPPORT_INBOX || FALLBACK_SUPPORT_INBOX;

  // Identify the sender when we know them, so support does not have to ask who is
  // writing. Nothing is added for a signed-out visitor.
  const lines = ["Hi ROBOTAT 👋 I need help with my account."];
  if (lead.name || lead.email) lines.push("");
  if (lead.name) lines.push(`Name: ${lead.name}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);
  const body = lines.join("\n");

  return {
    email,
    whatsappUrl: `https://wa.me/${businessWhatsappNumber()}?text=${encodeURIComponent(body)}`,
    mailtoUrl: `mailto:${email}?subject=${encodeURIComponent("ROBOTAT support")}&body=${encodeURIComponent(body)}`,
  };
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
 * ## Why `to` is a parameter and not `a.email`
 *
 * `assessments.email` is whatever was typed into the booking form. The form prefills it
 * with the account's address, but it is free text and the row stores whatever arrived.
 * A different address there is a legitimate thing to enter — a farm manager booking for
 * a site can reasonably give the foreman's — and the business notice above keeps using
 * it, because that one lands in ROBOTAT's own inbox and is contact information staff
 * asked for.
 *
 * This message is the other kind. It is addressed outward, and its body echoes back the
 * name, phone, company, land size and location the submitter typed. Sent to the form's
 * address, the endpoint is a small mailer: any signed-in account can put text of its own
 * choosing in front of a stranger, over ROBOTAT's SMTP reputation and above ROBOTAT's
 * signature. The verification gate on the booking route reads as though it closed that
 * and does not — it proves the *account* owns *its* mailbox, not that it owns the one in
 * the form — and the three-a-day cap only bounds how often it can be done.
 *
 * So the caller passes the address the account was verified at, and the form's value
 * stays what it is: contact information for the business.
 *
 * ## A null recipient
 *
 * `assessments.user_id` is nullable — deleting an account detaches its bookings rather
 * than destroying them — so an assessment can have no owner and therefore no account
 * address. Nobody is waiting on a confirmation for one of those, so it is skipped and
 * logged. `a.email` is deliberately not a fallback: falling back to it is the bug.
 *
 * ## Two things that did NOT change
 *
 * `replyTo` is still the business inbox. The business notice sets reply-to to the
 * customer so staff can answer them; copying that pattern here would point the
 * customer's reply back at themselves, and the message explicitly invites a reply to
 * correct a wrong phone number.
 *
 * The language still comes from `assessments.locale` rather than from the account's
 * `locale`, because this message describes a booking and the booking's language is the
 * one it was made in — an account that later switches language should not retroactively
 * change the confirmation for a booking it already made. Only the envelope moved.
 */
async function sendCustomerConfirmation(a: Assessment, to: string | null): Promise<void> {
  if (!to) {
    log(`[email] assessment #${a.id} has no account address — no confirmation sent`, "notify");
    return;
  }

  const { subject, body } = bookingConfirmationMessage(a);
  await deliverEmail({
    to,
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

/** Where Resend accepts a message. Overridable so tests never touch the network. */
const RESEND_ENDPOINT = process.env.RESEND_ENDPOINT || "https://api.resend.com/emails";

/**
 * Hand one message to Resend over HTTPS.
 *
 * Deliberately a bare fetch. The whole payload is four fields, the failure modes are HTTP
 * status codes, and a vendor SDK would be a dependency to keep current in exchange for
 * nothing — the same reasoning that put APNs on node:http2 rather than a push library.
 * Another provider is a different URL and a differently-shaped body, both in this
 * function.
 *
 * Errors carry the provider's own message. A 422 for an unverified sending domain and a
 * 401 for a bad key need to be told apart by whoever reads the log, and "request failed"
 * tells them neither.
 *
 * The timeout matters as much here as it did for SMTP: without it a hung connection holds
 * the request that triggered it, and resend-verification awaits this.
 */
export async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const doFetch = opts.fetchImpl ?? fetch;

  const res = await doFetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Read the body for the provider's explanation, but never let a failure to read it
    // replace the status — a 401 that reports itself as a JSON parse error is worse than
    // a 401 with no detail.
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend rejected the message (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
}

/**
 * Pin the SMTP connection to IPv4, because nodemailer picks a family at random.
 *
 * `smtp.hostinger.com` publishes both an A record and an AAAA record. nodemailer resolves
 * the host itself (shared/index.js resolveHostname), concatenates the two families under a
 * comment that says "IPv4 first, then IPv6" — and then does not preserve that order.
 * Called three times in a row against the same name it returned 172.65.255.143, then the
 * IPv6 address, then the IPv6 address. The choice is effectively a coin toss per process.
 *
 * On a host with no IPv6 route that is not an outage, it is worse: mail works or fails
 * depending on which address that boot happened to draw. Ours drew the AAAA and every send
 * died with `connect ENETUNREACH 2606:4700:…:465`.
 *
 * Neither `--dns-result-order=ipv4first` nor `dns.setDefaultResultOrder()` fixes it. Those
 * only affect `dns.lookup`, and nodemailer resolves through `dns.resolve4`/`resolve6`,
 * which they do not touch — verified, not assumed.
 *
 * So the address is chosen here. Handing nodemailer an IP makes it skip its own resolution
 * entirely (`net.isIP(options.host)` short-circuits resolveHostname), and the `servername`
 * passed alongside keeps SNI and certificate validation pointed at the real hostname.
 *
 * A host with no A record falls through to the name unchanged, so an IPv6-only server still
 * works — this prefers IPv4, it does not require it. The resolver is injectable so the
 * behaviour can be tested without depending on live DNS.
 */
export async function smtpEndpoint(
  host: string,
  resolve4: (hostname: string) => Promise<string[]> = dnsPromises.resolve4,
): Promise<{ host: string; servername?: string }> {
  if (net.isIP(host)) return { host };

  try {
    const [ipv4] = await resolve4(host);
    if (ipv4) return { host: ipv4, servername: host };
  } catch {
    // No A record, or DNS is unhappy. Hand back the name and let nodemailer try — a
    // resolution problem should surface as its error, not as a silent refusal to send.
  }

  return { host };
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
  const { RESEND_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_REDIRECT_TO } = process.env;

  const redirected = Boolean(MAIL_REDIRECT_TO);
  const to = MAIL_REDIRECT_TO || opts.to;
  // ASCII "->" rather than an arrow glyph: one non-ASCII character forces the whole
  // Subject header into MIME quoted-printable, which makes an inbox of redirected
  // mail unsearchable in its raw form.
  const subject = redirected ? `[-> ${opts.to}] ${opts.subject}` : opts.subject;

  /*
    HTTPS first, because SMTP is not always allowed to leave.

    Railway drops outbound SMTP: 25, 465 and 587 all time out from a container, while all
    three answer in about 40 ms from a laptop. It is a normal anti-spam posture for a
    platform, it is not announced by an error that says so — nodemailer reports
    "Connection timeout" — and no combination of port, host or DNS setting gets around it.
    Every verification code this app tried to send died there.

    An HTTP API answers on 443, which nothing blocks, and brings the delivery log and
    bounce reporting that SMTP never gave us: "did that message arrive?" stops being a
    question this codebase cannot answer.

    Written against fetch rather than a vendor SDK, in the same spirit as APNs on
    node:http2 — one endpoint, one JSON body, no dependency to keep current. Swapping
    providers is this function, not a migration.
  */
  if (RESEND_API_KEY) {
    await sendViaResend({ apiKey: RESEND_API_KEY, from: mailFrom(), to, subject, text: opts.text, replyTo: opts.replyTo });
    log(
      redirected
        ? `[email] ${opts.context} redirected to ${to} (intended ${opts.to}) via https`
        : `[email] ${opts.context} sent to ${to} via https`,
      "notify",
    );
    return;
  }

  if (!SMTP_HOST) {
    log(`[email:dev] would send to ${to} — ${subject}\n${opts.text}`, "notify");
    return;
  }

  const endpoint = await smtpEndpoint(SMTP_HOST);

  const transport = nodemailer.createTransport({
    host: endpoint.host,
    /*
      SNI, and with it certificate validation, has to keep pointing at the hostname now
      that `host` is an address. Left alone, nodemailer sets servername to false for an IP
      (smtp-connection/index.js:84) and the handshake has no name to check against.

      Through `tls` rather than as a top-level `servername` because both TLS paths merge
      these options before their own fallback — the implicit-TLS connect and the STARTTLS
      upgrade — and because nodemailer's type definitions do not declare a top-level
      servername, so that spelling does not compile.
    */
    ...(endpoint.servername ? { tls: { servername: endpoint.servername } } : {}),
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    /*
      nodemailer's own defaults are 2 minutes to connect and 10 minutes of socket
      inactivity. That is how a single unreachable address held POST
      /api/auth/resend-verification open for 122 seconds before failing: the caller waits
      out the whole connect timeout. Ten seconds is far longer than a working SMTP
      handshake needs and short enough that a broken one is reported rather than endured.
    */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
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

/**
 * Fire both delivery channels; never throws (a delivery failure must not fail the booking).
 *
 * `confirmTo` is the address the customer's own confirmation goes to — the account's,
 * not the form's. It is a required argument rather than something derived in here so
 * that a future caller has to decide who is being written to instead of inheriting an
 * answer; see sendCustomerConfirmation for why the two addresses are not the same thing.
 */
export async function deliverAssessment(
  a: Assessment,
  opts: { confirmTo: string | null },
): Promise<void> {
  await deliverAll(`assessment #${a.id}`, {
    "business email": sendEmail(a),
    "customer confirmation email": sendCustomerConfirmation(a, opts.confirmTo),
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
  /*
    Either transport counts as configured. RESEND_API_KEY takes precedence in
    deliverEmail, so warning about a missing SMTP_HOST while mail is going out perfectly
    well over HTTPS would send someone looking for a problem that is not there.
  */
  if (env.NODE_ENV === "production" && !env.RESEND_API_KEY && !env.SMTP_HOST) {
    warnings.push(
      "Neither RESEND_API_KEY nor SMTP_HOST is set in production — customer emails will " +
        "only be logged. Note that some hosts, Railway among them, block outbound SMTP " +
        "entirely, in which case only the HTTPS transport can deliver.",
    );
  }
  /*
    Both set is not an error — deliverEmail prefers HTTPS — but it is worth saying out
    loud, because the SMTP settings then have no effect and someone will eventually change
    them expecting something to happen.
  */
  if (env.RESEND_API_KEY && env.SMTP_HOST) {
    warnings.push(
      "RESEND_API_KEY and SMTP_HOST are both set. Mail goes over HTTPS via Resend; the " +
        "SMTP_* settings are unused. Remove them to avoid confusion.",
    );
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

import nodemailer from "nodemailer";
import type { Assessment } from "@shared/schema";
import { log } from "./log";

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

/** The message a customer receives when their booking's status changes. Pure/testable. */
export function customerStatusMessage(a: Assessment): { subject: string; body: string } {
  const ref = `#${a.id}`;
  const sign = "\n\n— ROBOTAT by NASL";
  const when = a.scheduledAt
    ? new Date(a.scheduledAt).toLocaleString("en-US", {
        dateStyle: "full",
        timeStyle: "short",
      })
    : null;

  switch (a.status) {
    case "scheduled":
      return {
        subject: "Your ROBOTAT site assessment is scheduled",
        body:
          `Hi ${a.name},\n\nGood news — your site assessment (${ref}) has been scheduled` +
          `${when ? ` for ${when}` : ""}. Our agronomy team will be in touch with the details.` +
          sign,
      };
    case "completed":
      return {
        subject: "Your ROBOTAT site assessment is complete",
        body: `Hi ${a.name},\n\nYour site assessment (${ref}) is now complete. We'll follow up with the findings and recommended next steps.${sign}`,
      };
    case "cancelled":
      return {
        subject: "Your ROBOTAT site assessment was cancelled",
        body: `Hi ${a.name},\n\nYour site assessment (${ref}) has been cancelled. If this is unexpected, just reply to this message and we'll help.${sign}`,
      };
    default:
      return {
        subject: "Update on your ROBOTAT site assessment",
        body: `Hi ${a.name},\n\nThe status of your site assessment (${ref}) is now: ${a.status}.${sign}`,
      };
  }
}

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
  const { body } = customerStatusMessage(a);

  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
  if (!res.ok) {
    log(`[whatsapp] customer notice error ${res.status}: ${await res.text()}`, "notify");
  } else {
    log(`[whatsapp] status notice for #${a.id} pushed to ${to}`, "notify");
  }
}

/** Notify the customer their booking changed status. Best-effort; never throws. */
export async function notifyCustomerStatusChange(a: Assessment): Promise<void> {
  await Promise.allSettled([emailCustomer(a), whatsappCustomer(a)]);
}

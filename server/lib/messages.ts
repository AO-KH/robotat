import type { Assessment } from "@shared/schema";

/**
 * What ROBOTAT says to a customer, per channel.
 *
 * These live apart from `notify.ts` for two reasons. They are pure — no SMTP, no
 * fetch, no database — so they are cheap to test and safe to import anywhere. And
 * `apns.ts` needs the push wording while `notify.ts` needs the APNs senders, which
 * made those two modules import each other. That cycle happened to be harmless (every
 * crossing was a hoisted function called at request time) but it was one top-level
 * statement away from breaking, and it would have broken at boot, in production.
 *
 * Each channel gets its own builder rather than one message reshaped three ways. An
 * email can open with a greeting and close with a signature; a WhatsApp template takes
 * three single-line parameters and rejects newlines; a lock-screen notification has
 * about forty characters of title and two lines of body before iOS truncates it.
 * Those are genuinely different constraints, not formatting of the same string.
 */

const SIGN = "\n\n— ROBOTAT by NASL";

function scheduledFor(a: Assessment): string | null {
  return a.scheduledAt
    ? new Date(a.scheduledAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })
    : null;
}

/** Email. Full sentences, greeting, signature. */
export function customerStatusMessage(a: Assessment): { subject: string; body: string } {
  const ref = `#${a.id}`;
  const when = a.scheduledAt
    ? new Date(a.scheduledAt).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })
    : null;

  switch (a.status) {
    case "scheduled":
      return {
        subject: "Your ROBOTAT site assessment is scheduled",
        body:
          `Hi ${a.name},\n\nGood news — your site assessment (${ref}) has been scheduled` +
          `${when ? ` for ${when}` : ""}. Our agronomy team will be in touch with the details.` +
          SIGN,
      };
    case "completed":
      return {
        subject: "Your ROBOTAT site assessment is complete",
        body: `Hi ${a.name},\n\nYour site assessment (${ref}) is now complete. We'll follow up with the findings and recommended next steps.${SIGN}`,
      };
    case "cancelled":
      return {
        subject: "Your ROBOTAT site assessment was cancelled",
        body: `Hi ${a.name},\n\nYour site assessment (${ref}) has been cancelled. If this is unexpected, just reply to this message and we'll help.${SIGN}`,
      };
    default:
      return {
        subject: "Update on your ROBOTAT site assessment",
        body: `Hi ${a.name},\n\nThe status of your site assessment (${ref}) is now: ${a.status}.${SIGN}`,
      };
  }
}

/**
 * Push notification. Deliberately NOT the email body.
 *
 * iOS shows roughly forty characters of title and collapses the body to two lines on
 * the lock screen. Reusing the email text put `Hi Sara,` and a signature block in
 * there, so what a customer actually saw was "Hi Sara, Good news — your site
 * assessment (#7) has been…" — a truncated letter rather than a notification.
 *
 * The title carries the event, the body carries the detail, and neither repeats the
 * customer's own name back at them: they know who they are, and the space is better
 * spent on what happened.
 */
export function customerStatusPush(a: Assessment): { title: string; body: string } {
  const ref = `#${a.id}`;
  const when = scheduledFor(a);

  switch (a.status) {
    case "scheduled":
      return {
        title: "Site assessment scheduled",
        body: when ? `${ref} is booked for ${when}.` : `${ref} has been scheduled.`,
      };
    case "completed":
      return {
        title: "Site assessment complete",
        body: `${ref} is done — we'll follow up with the findings.`,
      };
    case "cancelled":
      return {
        title: "Site assessment cancelled",
        body: `${ref} has been cancelled. Tap to get in touch.`,
      };
    default:
      return { title: "Booking update", body: `${ref} is now ${a.status}.` };
  }
}

/**
 * WhatsApp template parameters, as exactly three strings.
 *
 * Business-initiated WhatsApp messages have to be templates. Plain text is only
 * delivered inside the 24-hour window opened by the customer's own last message, and
 * outside it Meta rejects the send with error 131047.
 *
 * Three rules come from Meta's API, not from taste:
 *  1. The count is fixed — placeholders are positional and not optional, which is why
 *     the scheduled date folds into the status phrase rather than being a fourth
 *     parameter that would be empty for every other status.
 *  2. No newlines, tabs, or runs of four or more spaces.
 *  3. Line breaks live in the template registered with Meta, not in the values.
 */
export function customerStatusTemplateParams(a: Assessment): [string, string, string] {
  const when = scheduledFor(a);

  let phrase: string;
  switch (a.status) {
    case "scheduled":
      phrase = when ? `scheduled for ${when}` : "scheduled";
      break;
    case "completed":
      phrase = "complete";
      break;
    case "cancelled":
      phrase = "cancelled";
      break;
    default:
      phrase = a.status;
  }

  // Collapse anything Meta would reject. `toLocaleString` can emit a narrow no-break
  // space (U+202F) before AM/PM, which is not matched by \s in every runtime — hence
  // the explicit character class rather than a bare \s+.
  const clean = (s: string) => s.replace(/[\s  ]+/g, " ").trim();

  return [clean(a.name), `#${a.id}`, clean(phrase)];
}

/**
 * Booking confirmation — the first thing a customer hears after submitting the form.
 *
 * Until this existed, the only automated message they got was a status change, which
 * happens whenever staff get around to it. So a customer filled in the form and then
 * heard nothing: no reference number, and no way to tell their request had arrived at
 * all. The web app papers over this by opening their mail client on submit, which does
 * nothing in the iOS app and nothing for anyone without a mail client configured.
 *
 * It echoes back what they entered rather than only acknowledging receipt. A mistyped
 * phone number or a land size off by a decimal place is cheapest to catch now, while
 * they still remember typing it — and a wrong phone number is exactly the kind of
 * error that otherwise surfaces as an agronomist failing to reach them.
 */
export function bookingConfirmationMessage(a: Assessment): { subject: string; body: string } {
  // Only what the customer actually filled in. Individual bookings post company as "",
  // so this filters on falsiness rather than on null.
  const details = [
    a.phone ? `Phone: ${a.phone}` : null,
    a.company ? `Company: ${a.company}` : null,
    a.landSize ? `Land size: ${a.landSize} ha` : null,
    a.location ? `Location: ${a.location}` : null,
  ].filter(Boolean);

  return {
    subject: `We've received your site assessment request (#${a.id})`,
    body:
      `Hi ${a.name},\n\nThanks — we've received your request for a ROBOTAT site assessment. ` +
      `Your reference is #${a.id}.\n\n` +
      (details.length > 0 ? `What you told us:\n${details.join("\n")}\n\n` : "") +
      `Our agronomy team will review it and contact you to arrange a visit. If anything ` +
      `above is wrong, reply to this email and we'll put it right.${SIGN}`,
  };
}

/** Password-reset email body. Pure/testable. */
export function passwordResetMessage(name: string, link: string): { subject: string; body: string } {
  return {
    subject: "Reset your ROBOTAT password",
    body:
      `Hi ${name},\n\nWe received a request to reset your password. ` +
      `Open the link below to choose a new one — it expires in 1 hour:\n\n${link}\n\n` +
      `If you didn't request this, you can safely ignore this email.${SIGN}`,
  };
}

/** Email-verification body. Pure/testable. */
export function emailVerificationMessage(name: string, link: string): { subject: string; body: string } {
  return {
    subject: "Confirm your ROBOTAT email",
    body:
      `Hi ${name},\n\nWelcome to ROBOTAT! Please confirm your email address by opening ` +
      `the link below (valid for 24 hours):\n\n${link}\n\n` +
      `If you didn't create an account, you can ignore this email.${SIGN}`,
  };
}

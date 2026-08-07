import type { Assessment, Locale } from "@shared/schema";

/**
 * What ROBOTAT says to a customer, per channel and per language.
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
 *
 * ## Language
 *
 * The app is bilingual, so the mail is too. Each builder takes the language from the
 * record it is describing — `assessments.locale` for booking mail, the user's own
 * `locale` for account mail — and falls back to English for anything it does not
 * recognise, including the null a row written before that column existed will have.
 *
 * The Arabic is not a translation of the English laid over the same sentence shapes;
 * it is the same message written in Arabic. Reference numbers, links and the ROBOTAT
 * and NASL names stay Latin in both, because they are identifiers rather than words.
 */

/** Anything unrecognised — including a null from a pre-0009 row — reads as English. */
export function resolveLocale(value: string | null | undefined): Locale {
  return value === "ar" ? "ar" : "en";
}

const SIGN: Record<Locale, string> = {
  en: "\n\n— ROBOTAT by NASL",
  ar: "\n\n— ROBOTAT من NASL",
};

/**
 * Date formatting per language.
 *
 * Both extensions on the Arabic tag are load-bearing, and neither is cosmetic.
 *
 * `-nu-latn` pins Latin digits. Plain "ar-SA" renders 2026 as ٢٠٢٦, so a scheduled
 * date arrived in Arabic-Indic numerals while the reference number beside it (#12) and
 * the land size the customer typed stayed Latin — three numbering systems in one short
 * message. One system, and it is the one the rest of the message already uses.
 *
 * `-u-ca-gregory` pins the calendar rather than inheriting whatever the runtime picks
 * for region SA. CLDR carries islamic-umalqura as a calendar preference for Saudi
 * Arabia, and which one ICU actually defaults to has differed across builds — this one
 * gives Gregorian. A date that silently becomes Hijri on a different Node image is not
 * something to discover from a customer who turned up on the wrong day, so it is
 * stated here instead of assumed.
 */
const DATE_LOCALE: Record<Locale, string> = {
  en: "en-US",
  ar: "ar-SA-u-ca-gregory-nu-latn",
};

/** Short form, for push and WhatsApp where space is tight. */
function scheduledFor(a: Assessment, locale: Locale): string | null {
  return a.scheduledAt
    ? new Date(a.scheduledAt).toLocaleString(DATE_LOCALE[locale], { dateStyle: "long", timeStyle: "short" })
    : null;
}

/** Long form, for email, which has room for the weekday. */
function scheduledForLong(a: Assessment, locale: Locale): string | null {
  return a.scheduledAt
    ? new Date(a.scheduledAt).toLocaleString(DATE_LOCALE[locale], { dateStyle: "full", timeStyle: "short" })
    : null;
}

/* ============================================================
 * Status change — email
 * ========================================================== */

type Message = { subject: string; body: string };
type Push = { title: string; body: string };

const STATUS_EMAIL: Record<Locale, (name: string, ref: string, when: string | null, status: string) => Record<string, Message>> = {
  en: (name, ref, when, status) => ({
    scheduled: {
      subject: "Your ROBOTAT site assessment is scheduled",
      body:
        `Hi ${name},\n\nGood news — your site assessment (${ref}) has been scheduled` +
        `${when ? ` for ${when}` : ""}. Our agronomy team will be in touch with the details.` +
        SIGN.en,
    },
    completed: {
      subject: "Your ROBOTAT site assessment is complete",
      body: `Hi ${name},\n\nYour site assessment (${ref}) is now complete. We'll follow up with the findings and recommended next steps.${SIGN.en}`,
    },
    cancelled: {
      subject: "Your ROBOTAT site assessment was cancelled",
      body: `Hi ${name},\n\nYour site assessment (${ref}) has been cancelled. If this is unexpected, just reply to this message and we'll help.${SIGN.en}`,
    },
    fallback: {
      subject: "Update on your ROBOTAT site assessment",
      body: `Hi ${name},\n\nThe status of your site assessment (${ref}) is now: ${status}.${SIGN.en}`,
    },
  }),
  ar: (name, ref, when, status) => ({
    scheduled: {
      subject: "تم تحديد موعد زيارة تقييم موقعك",
      body:
        `مرحباً ${name}،\n\nخبر سار — تم تحديد موعد زيارة تقييم موقعك (${ref})` +
        `${when ? ` في ${when}` : ""}. سيتواصل معك فريق الهندسة الزراعية لدينا لتأكيد التفاصيل.` +
        SIGN.ar,
    },
    completed: {
      subject: "اكتملت زيارة تقييم موقعك",
      body: `مرحباً ${name}،\n\nاكتملت زيارة تقييم موقعك (${ref}). سنتواصل معك قريباً بالنتائج والخطوات المقترحة.${SIGN.ar}`,
    },
    cancelled: {
      subject: "تم إلغاء زيارة تقييم موقعك",
      body: `مرحباً ${name}،\n\nتم إلغاء زيارة تقييم موقعك (${ref}). إذا كان هذا غير متوقع، يُرجى الرد على هذه الرسالة وسنساعدك.${SIGN.ar}`,
    },
    fallback: {
      subject: "تحديث بشأن زيارة تقييم موقعك",
      body: `مرحباً ${name}،\n\nحالة طلب زيارة تقييم موقعك (${ref}) الآن: ${status}.${SIGN.ar}`,
    },
  }),
};

/** Email. Full sentences, greeting, signature. */
export function customerStatusMessage(a: Assessment): Message {
  const locale = resolveLocale(a.locale);
  const table = STATUS_EMAIL[locale](a.name, `#${a.id}`, scheduledForLong(a, locale), a.status);
  return table[a.status] ?? table.fallback;
}

/* ============================================================
 * Status change — push
 * ========================================================== */

const STATUS_PUSH: Record<Locale, (ref: string, when: string | null, status: string) => Record<string, Push>> = {
  en: (ref, when, status) => ({
    scheduled: {
      title: "Site assessment scheduled",
      body: when ? `${ref} is booked for ${when}.` : `${ref} has been scheduled.`,
    },
    completed: { title: "Site assessment complete", body: `${ref} is done — we'll follow up with the findings.` },
    cancelled: { title: "Site assessment cancelled", body: `${ref} has been cancelled. Tap to get in touch.` },
    fallback: { title: "Booking update", body: `${ref} is now ${status}.` },
  }),
  ar: (ref, when, status) => ({
    scheduled: {
      title: "تم تحديد موعد الزيارة",
      body: when ? `${ref} محدد في ${when}.` : `${ref} تم تحديد موعده.`,
    },
    completed: { title: "اكتملت زيارة الموقع", body: `${ref} اكتمل — سنتواصل معك بالنتائج.` },
    cancelled: { title: "تم إلغاء الزيارة", body: `${ref} تم إلغاؤه. اضغط للتواصل معنا.` },
    fallback: { title: "تحديث الطلب", body: `${ref} الآن ${status}.` },
  }),
};

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
export function customerStatusPush(a: Assessment): Push {
  const locale = resolveLocale(a.locale);
  const table = STATUS_PUSH[locale](`#${a.id}`, scheduledFor(a, locale), a.status);
  return table[a.status] ?? table.fallback;
}

/* ============================================================
 * Status change — WhatsApp template parameters
 * ========================================================== */

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
 *
 * These stay English while the other channels localise, and that is deliberate rather
 * than an omission. The sentence around these values lives in a template registered
 * with Meta under a specific language code (WHATSAPP_TEMPLATE_LANG), not in this repo.
 * Translating the parameters without registering an Arabic template would post Arabic
 * values into English scaffolding — worse than either language on its own. Localising
 * this channel means registering a second template and selecting it by locale, which
 * needs the Meta Business account.
 */
/**
 * Collapse a value into something Meta will accept as a template parameter.
 *
 * `toLocaleString` can emit a narrow no-break space (U+202F) before AM/PM, which is not
 * matched by \s in every runtime — hence the explicit character class rather than a
 * bare \s+. Also caps length: a customer's free-text note can run to paragraphs, and an
 * over-long parameter fails the whole send rather than being trimmed.
 */
function cleanParam(s: string, max = 300): string {
  const collapsed = s.replace(/[\s  ]+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

/**
 * The business's own booking alert, as five template parameters.
 *
 * Same information as the notification email, rearranged to fit Meta's shape: the
 * prose and line breaks live in the template registered with Meta, and only the values
 * travel here. Parameters are positional and not optional, so every one of the five is
 * always present — a booking with no phone or no land size sends an em dash rather
 * than an empty string, which Meta rejects.
 *
 * English, like the notification email it mirrors: this one is read by staff, not by
 * the customer, so it does not follow `a.locale`.
 */
export function businessBookingTemplateParams(a: Assessment): [string, string, string, string, string] {
  const site = [a.landSize ? `${a.landSize} ha` : null, a.location].filter(Boolean).join(" · ");
  return [
    cleanParam(a.name),
    `#${a.id}`,
    cleanParam([a.phone, a.email].filter(Boolean).join(" / ")),
    cleanParam(site) || "—",
    cleanParam(a.message ?? "") || "—",
  ];
}

export function customerStatusTemplateParams(a: Assessment): [string, string, string] {
  const when = scheduledFor(a, "en");

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

  return [cleanParam(a.name), `#${a.id}`, cleanParam(phrase)];
}

/* ============================================================
 * Booking confirmation
 * ========================================================== */

const CONFIRMATION = {
  en: {
    labels: { phone: "Phone", company: "Company", landSize: "Land size", location: "Location" },
    hectares: (v: string) => `${v} ha`,
    heading: "What you told us:",
    subject: (ref: string) => `We've received your site assessment request (${ref})`,
    body: (name: string, ref: string, details: string) =>
      `Hi ${name},\n\nThanks — we've received your request for a ROBOTAT site assessment. ` +
      `Your reference is ${ref}.\n\n` +
      details +
      `Our agronomy team will review it and contact you to arrange a visit. If anything ` +
      `above is wrong, reply to this email and we'll put it right.${SIGN.en}`,
  },
  ar: {
    labels: { phone: "رقم الهاتف", company: "الشركة", landSize: "مساحة الأرض", location: "الموقع" },
    hectares: (v: string) => `${v} هكتار`,
    heading: "ما زوّدتنا به:",
    subject: (ref: string) => `استلمنا طلب زيارة تقييم موقعك (${ref})`,
    body: (name: string, ref: string, details: string) =>
      `مرحباً ${name}،\n\nشكراً لك — استلمنا طلبك لزيارة تقييم الموقع من ROBOTAT. ` +
      `الرقم المرجعي لطلبك هو ${ref}.\n\n` +
      details +
      `سيقوم فريق الهندسة الزراعية لدينا بمراجعة الطلب والتواصل معك لترتيب موعد الزيارة. ` +
      `إذا كان أي مما سبق غير صحيح، يُرجى الرد على هذه الرسالة وسنقوم بتصحيحه.${SIGN.ar}`,
  },
} as const;

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
export function bookingConfirmationMessage(a: Assessment): Message {
  const t = CONFIRMATION[resolveLocale(a.locale)];
  const ref = `#${a.id}`;

  // Only what the customer actually filled in. Individual bookings post company as "",
  // so this filters on falsiness rather than on null.
  const lines = [
    a.phone ? `${t.labels.phone}: ${a.phone}` : null,
    a.company ? `${t.labels.company}: ${a.company}` : null,
    a.landSize ? `${t.labels.landSize}: ${t.hectares(a.landSize)}` : null,
    a.location ? `${t.labels.location}: ${a.location}` : null,
  ].filter(Boolean);

  const details = lines.length > 0 ? `${t.heading}\n${lines.join("\n")}\n\n` : "";

  return { subject: t.subject(ref), body: t.body(a.name, ref, details) };
}

/* ============================================================
 * Account mail — reset and verification
 * ========================================================== */

const ACCOUNT = {
  en: {
    reset: (name: string, link: string): Message => ({
      subject: "Reset your ROBOTAT password",
      body:
        `Hi ${name},\n\nWe received a request to reset your password. ` +
        `Open the link below to choose a new one — it expires in 1 hour:\n\n${link}\n\n` +
        `If you didn't request this, you can safely ignore this email.${SIGN.en}`,
    }),
    verify: (name: string, code: string): Message => ({
      // The code is in the subject as well as the body: on a phone that often makes it
      // readable straight from the notification, without opening the message at all.
      subject: `${code} is your ROBOTAT confirmation code`,
      body:
        `Hi ${name},\n\nWelcome to ROBOTAT! Your confirmation code is:\n\n${code}\n\n` +
        `Enter it in the app to finish setting up your account. It expires in 15 minutes.\n\n` +
        `If you didn't create an account, you can ignore this email.${SIGN.en}`,
    }),
  },
  ar: {
    reset: (name: string, link: string): Message => ({
      subject: "إعادة تعيين كلمة مرور ROBOTAT",
      body:
        `مرحباً ${name}،\n\nوردنا طلب لإعادة تعيين كلمة المرور الخاصة بك. ` +
        `افتح الرابط أدناه لاختيار كلمة مرور جديدة — تنتهي صلاحيته خلال ساعة واحدة:\n\n${link}\n\n` +
        `إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.${SIGN.ar}`,
    }),
    verify: (name: string, code: string): Message => ({
      subject: `${code} هو رمز التأكيد الخاص بك في ROBOTAT`,
      body:
        `مرحباً ${name}،\n\nأهلاً بك في ROBOTAT! رمز التأكيد الخاص بك هو:\n\n${code}\n\n` +
        `أدخله في التطبيق لإكمال إعداد حسابك. تنتهي صلاحيته خلال 15 دقيقة.\n\n` +
        `إذا لم تُنشئ حساباً، يمكنك تجاهل هذه الرسالة.${SIGN.ar}`,
    }),
  },
} as const;

/** Password-reset email body. Pure/testable. */
export function passwordResetMessage(name: string, link: string, locale?: string | null): Message {
  return ACCOUNT[resolveLocale(locale)].reset(name, link);
}

/** Email-verification body carrying the 6-digit code. Pure/testable. */
export function emailVerificationMessage(name: string, code: string, locale?: string | null): Message {
  return ACCOUNT[resolveLocale(locale)].verify(name, code);
}

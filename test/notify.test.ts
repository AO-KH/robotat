import { describe, it, expect } from "vitest";
import type { Assessment } from "@shared/schema";
import {
  bookingConfirmationMessage,
  businessBookingTemplateParams,
  customerStatusMessage,
  customerStatusPush,
  customerStatusTemplateParams,
  emailVerificationMessage,
  mailFrom,
  notifyConfigWarnings,
  passwordResetMessage,
} from "../server/lib/notify";

/** Minimal assessment fixture; only the fields the message builder reads matter. */
function fixture(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: 7,
    userId: 1,
    name: "Sara",
    email: "sara@example.com",
    phone: null,
    company: null,
    landSize: null,
    location: null,
    message: null,
    status: "pending",
    scheduledAt: null,
    createdAt: new Date(),
    ...overrides,
  } as Assessment;
}

describe("customerStatusMessage", () => {
  it("scheduled: mentions scheduling and includes the date when present", () => {
    const msg = customerStatusMessage(fixture({ status: "scheduled", scheduledAt: new Date("2026-08-01T09:00:00Z") }));
    expect(msg.subject).toMatch(/scheduled/i);
    expect(msg.body).toContain("Sara");
    expect(msg.body).toContain("#7");
    expect(msg.body).toMatch(/2026/); // the formatted date is included
  });

  it("scheduled without a date: still valid, no date phrase", () => {
    const msg = customerStatusMessage(fixture({ status: "scheduled" }));
    expect(msg.subject).toMatch(/scheduled/i);
    expect(msg.body).not.toMatch(/ for /);
  });

  it("completed and cancelled produce distinct, on-topic messages", () => {
    expect(customerStatusMessage(fixture({ status: "completed" })).subject).toMatch(/complete/i);
    expect(customerStatusMessage(fixture({ status: "cancelled" })).subject).toMatch(/cancel/i);
  });
});

describe("bookingConfirmationMessage", () => {
  it("carries the reference number in both subject and body", () => {
    const msg = bookingConfirmationMessage(fixture());
    // The subject is where a customer looks first when hunting for the reference.
    expect(msg.subject).toContain("#7");
    expect(msg.body).toContain("#7");
    expect(msg.body).toContain("Sara");
  });

  it("echoes back the details the customer entered", () => {
    const msg = bookingConfirmationMessage(
      fixture({ phone: "+966501234567", landSize: "25", location: "Al-Kharj" }),
    );
    expect(msg.body).toContain("+966501234567");
    expect(msg.body).toContain("25 ha");
    expect(msg.body).toContain("Al-Kharj");
  });

  it("omits the details block entirely when only name and email were given", () => {
    // Individual bookings post company as "" rather than null, so a falsiness check is
    // what keeps an empty "Company:" line out of the mail.
    const msg = bookingConfirmationMessage(fixture({ company: "" }));
    expect(msg.body).not.toMatch(/What you told us/);
    expect(msg.body).not.toMatch(/Company:/);
    expect(msg.body).not.toMatch(/undefined|null/);
  });

  it("reads as a receipt, not a status change", () => {
    // Guards against this being folded into customerStatusMessage later: a pending
    // booking there produces "The status ... is now: pending", which tells a customer
    // nothing and names an internal state back at them.
    const msg = bookingConfirmationMessage(fixture());
    expect(msg.body).toMatch(/received/i);
    expect(msg.body).not.toMatch(/status/i);
  });
});

describe("businessBookingTemplateParams", () => {
  it("carries the same facts as the notification email", () => {
    const p = businessBookingTemplateParams(
      fixture({ phone: "+966555998877", landSize: "60", location: "Al-Kharj", message: "Date palms." }),
    );
    expect(p).toHaveLength(5);
    expect(p[0]).toBe("Sara");
    expect(p[1]).toBe("#7");
    expect(p[2]).toContain("+966555998877");
    expect(p[3]).toBe("60 ha · Al-Kharj");
    expect(p[4]).toBe("Date palms.");
  });

  it("never emits an empty parameter", () => {
    // Meta's placeholders are positional and not optional; an empty string fails the
    // whole send, so a booking with nothing but a name and email must still fill five.
    const p = businessBookingTemplateParams(fixture({ phone: null, landSize: null, location: null, message: null }));
    expect(p).toHaveLength(5);
    for (const value of p) expect(value.length).toBeGreaterThan(0);
  });

  it("collapses newlines and caps a long note", () => {
    // Parameters reject newlines, tabs and runs of four spaces, and an over-long one
    // fails the send rather than being truncated by Meta.
    const p = businessBookingTemplateParams(fixture({ message: `line one\nline two\t\tand    more` }));
    expect(p[4]).toBe("line one line two and more");

    const long = businessBookingTemplateParams(fixture({ message: "x".repeat(500) }));
    expect(long[4].length).toBeLessThanOrEqual(300);
    expect(long[4].endsWith("…")).toBe(true);
  });

  it("stays English even for an Arabic booking", () => {
    // Staff read this one, not the customer — it mirrors the English business email.
    const p = businessBookingTemplateParams(fixture({ locale: "ar", landSize: "60" }));
    expect(p[3]).toContain("ha");
  });
});

/* ============================================================
 * Language
 * ========================================================== */

describe("Arabic", () => {
  it("writes the confirmation in Arabic, labels and units included", () => {
    const msg = bookingConfirmationMessage(
      fixture({ locale: "ar", name: "سارة", phone: "+966501234567", landSize: "25" }),
    );
    expect(msg.subject).toContain("استلمنا");
    expect(msg.body).toContain("مرحباً سارة");
    expect(msg.body).toContain("ما زوّدتنا به:");
    expect(msg.body).toContain("رقم الهاتف: +966501234567");
    // The unit is translated, not just the label — "25 ha" would be half a translation.
    expect(msg.body).toContain("مساحة الأرض: 25 هكتار");
    expect(msg.body).not.toMatch(/Hi |Thanks|Land size/);
  });

  it("writes status changes and push notifications in Arabic", () => {
    const a = fixture({ locale: "ar", status: "scheduled", scheduledAt: new Date("2026-09-14T07:00:00Z") });
    expect(customerStatusMessage(a).subject).toContain("تم تحديد موعد");
    expect(customerStatusPush(a).title).toContain("تم تحديد موعد");
    expect(customerStatusMessage(a).body).not.toMatch(/Good news|Hi /);
  });

  it("keeps dates Gregorian and Latin-digited", () => {
    // Both are pinned on the locale tag. Without -nu-latn the year renders ٢٠٢٦, which
    // would sit beside a Latin "#7" in the same sentence; without -u-ca-gregory the
    // calendar is whatever the runtime picks for region SA, which has varied.
    const body = customerStatusMessage(
      fixture({ locale: "ar", status: "scheduled", scheduledAt: new Date("2026-09-14T07:00:00Z") }),
    ).body;
    expect(body).toContain("2026");
    expect(body).toContain("سبتمبر");
    expect(body).not.toMatch(/[٠-٩]/); // no Arabic-Indic digits
    expect(body).not.toContain("هـ"); // no Hijri era marker
  });

  it("localises account mail off the user's own language", () => {
    expect(passwordResetMessage("سارة", "https://x/y", "ar").subject).toContain("إعادة تعيين");
    expect(emailVerificationMessage("سارة", "https://x/y", "ar").subject).toContain("تأكيد");
    // The link is an identifier, not prose — it must survive untouched.
    expect(passwordResetMessage("سارة", "https://x/y", "ar").body).toContain("https://x/y");
  });

  it("falls back to English for null, undefined and anything unrecognised", () => {
    // A row written before the column existed reads as null, and an older client could
    // send something else entirely. Neither should produce an empty or broken message.
    for (const locale of [null, undefined, "", "fr", "AR", "en-GB"]) {
      const msg = bookingConfirmationMessage(fixture({ locale } as Partial<Assessment>));
      expect(msg.subject).toContain("We've received");
      expect(msg.body).toContain("Hi Sara");
    }
    expect(passwordResetMessage("Sara", "https://x/y").subject).toMatch(/Reset your/);
  });

  it("leaves the WhatsApp template parameters in English on purpose", () => {
    // The sentence around these lives in a template registered with Meta under one
    // language code. Arabic values in English scaffolding is worse than either alone,
    // so localising this channel waits on a second registered template.
    const params = customerStatusTemplateParams(fixture({ locale: "ar", status: "completed" }));
    expect(params[2]).toBe("complete");
  });
});

/* ============================================================
 * WhatsApp status template
 * ========================================================== */

describe("customerStatusTemplateParams", () => {
  it("always returns exactly three values", () => {
    // Meta's placeholders are positional and not optional: a template registered with
    // {{1}} {{2}} {{3}} is rejected if it receives two values or four. Every status
    // must therefore produce the same count, whatever it has to say.
    for (const status of ["pending", "scheduled", "completed", "cancelled"]) {
      const params = customerStatusTemplateParams(fixture({ status }));
      expect(params, `status "${status}"`).toHaveLength(3);
      expect(params.every((p) => typeof p === "string" && p.length > 0)).toBe(true);
    }
  });

  it("never emits a newline, tab, or run of four spaces", () => {
    // Meta rejects all three outright. This is why customerStatusMessage().body cannot
    // be reused here — it is multi-line and carries a signature block.
    const cases = [
      fixture({ status: "scheduled", scheduledAt: new Date("2026-09-01T07:30:00Z") }),
      fixture({ status: "completed", name: "Sara   Al  Otaibi" }),
      fixture({ status: "cancelled", name: "Line\nBreak\tName" }),
    ];
    for (const a of cases) {
      for (const p of customerStatusTemplateParams(a)) {
        expect(p).not.toMatch(/[\n\r\t]/);
        expect(p).not.toMatch(/ {4}/);
      }
    }
  });

  it("folds the scheduled date into the status phrase rather than adding a parameter", () => {
    const withDate = customerStatusTemplateParams(
      fixture({ status: "scheduled", scheduledAt: new Date("2026-09-01T07:30:00Z") }),
    );
    expect(withDate).toHaveLength(3);
    expect(withDate[2]).toMatch(/^scheduled for /);
    expect(withDate[2]).toContain("2026");

    // Same status with no date still yields three values, not two.
    const noDate = customerStatusTemplateParams(fixture({ status: "scheduled", scheduledAt: null }));
    expect(noDate).toHaveLength(3);
    expect(noDate[2]).toBe("scheduled");
  });

  it("passes the customer name and a booking reference as the first two values", () => {
    const [name, ref] = customerStatusTemplateParams(fixture({ id: 42, name: "Sara" }));
    expect(name).toBe("Sara");
    expect(ref).toBe("#42");
  });
});

describe("mailFrom", () => {
  it("prefers MAIL_FROM over the login credential", () => {
    expect(mailFrom({ MAIL_FROM: "ROBOTAT <hello@nasl-tech.com>", SMTP_USER: "resend" }))
      .toBe("ROBOTAT <hello@nasl-tech.com>");
  });

  it("falls back to SMTP_USER, which is what Gmail wants", () => {
    expect(mailFrom({ SMTP_USER: "someone@gmail.com" })).toBe("someone@gmail.com");
  });

  it("never leaves the From header empty", () => {
    expect(mailFrom({})).toContain("@");
  });
});

describe("notifyConfigWarnings", () => {
  it("warns when WhatsApp is live but no template is registered", () => {
    // The case that silently loses messages: credentials present, so sends are
    // attempted, but plain text only lands inside the customer's 24-hour window.
    const warnings = notifyConfigWarnings({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "p" });
    expect(warnings.some((w) => w.includes("WHATSAPP_STATUS_TEMPLATE"))).toBe(true);
  });

  it("warns when the business alert has no template either", () => {
    // Harder to spot than the customer one: nobody messages the business line to ask
    // for its own alerts, so the 24-hour window is essentially always shut.
    const warnings = notifyConfigWarnings({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "p" });
    expect(warnings.some((w) => w.includes("WHATSAPP_BOOKING_TEMPLATE"))).toBe(true);
  });

  it("warns when credentials are live but the number is still the placeholder", () => {
    // Sends are attempted and logged as pushed — to a number that does not exist.
    const warnings = notifyConfigWarnings({
      WHATSAPP_TOKEN: "t",
      WHATSAPP_PHONE_ID: "p",
      WHATSAPP_STATUS_TEMPLATE: "robotat_status_update",
      WHATSAPP_BOOKING_TEMPLATE: "robotat_new_booking",
    });
    expect(warnings.some((w) => w.includes("WHATSAPP_BUSINESS_NUMBER"))).toBe(true);
  });

  it("stays quiet when WhatsApp is fully configured", () => {
    const warnings = notifyConfigWarnings({
      WHATSAPP_TOKEN: "t",
      WHATSAPP_PHONE_ID: "p",
      WHATSAPP_STATUS_TEMPLATE: "robotat_status_update",
      WHATSAPP_BOOKING_TEMPLATE: "robotat_new_booking",
      WHATSAPP_BUSINESS_NUMBER: "966555998877",
    });
    expect(warnings).toEqual([]);
  });

  it("stays quiet when WhatsApp is switched off entirely", () => {
    // No credentials means no delivery attempt, so there is nothing to warn about.
    expect(notifyConfigWarnings({})).toEqual([]);
  });

  it("flags a half-configured credential pair", () => {
    expect(notifyConfigWarnings({ WHATSAPP_TOKEN: "t" }).length).toBe(1);
    expect(notifyConfigWarnings({ WHATSAPP_PHONE_ID: "p" }).length).toBe(1);
  });

  it("warns about a production deployment with no SMTP host", () => {
    const warnings = notifyConfigWarnings({ NODE_ENV: "production" });
    expect(warnings.some((w) => w.includes("SMTP_HOST"))).toBe(true);
  });
});

describe("MAIL_REDIRECT_TO", () => {
  it("warns loudly at boot, because customers silently receive nothing", () => {
    const warnings = notifyConfigWarnings({ MAIL_REDIRECT_TO: "dev@example.com" });
    const w = warnings.find((x) => x.includes("MAIL_REDIRECT_TO"));
    expect(w).toBeDefined();
    expect(w).toContain("dev@example.com");
  });

  it("stays quiet when it is not set", () => {
    expect(notifyConfigWarnings({}).some((w) => w.includes("MAIL_REDIRECT_TO"))).toBe(false);
  });
});

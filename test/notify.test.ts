import { describe, it, expect } from "vitest";
import type { Assessment } from "@shared/schema";
import {
  customerStatusMessage,
  customerStatusTemplateParams,
  notifyConfigWarnings,
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

describe("notifyConfigWarnings", () => {
  it("warns when WhatsApp is live but no template is registered", () => {
    // The case that silently loses messages: credentials present, so sends are
    // attempted, but plain text only lands inside the customer's 24-hour window.
    const warnings = notifyConfigWarnings({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "p" });
    expect(warnings.some((w) => w.includes("WHATSAPP_STATUS_TEMPLATE"))).toBe(true);
  });

  it("stays quiet when WhatsApp is fully configured", () => {
    const warnings = notifyConfigWarnings({
      WHATSAPP_TOKEN: "t",
      WHATSAPP_PHONE_ID: "p",
      WHATSAPP_STATUS_TEMPLATE: "robotat_status_update",
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

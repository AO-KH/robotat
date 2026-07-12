import { describe, it, expect } from "vitest";
import type { Assessment } from "@shared/schema";
import { customerStatusMessage } from "../server/lib/notify";

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

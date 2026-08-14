import { describe, it, expect } from "vitest";
import { registerSchema, updateProfileSchema, bookAssessmentSchema } from "@shared/schema";
import { emailVerificationMessage } from "../server/lib/messages";

/*
  Registering with someone else's address mails them a confirmation code. That cannot be
  avoided by checking first, because the check IS the mail — it is how the address gets
  proved. What can be controlled is what the message is allowed to say, and the body opens
  `Hi ${name},` with a value the sender chose.

  `name` used to have a minimum length and nothing else: no maximum, no restriction on
  content. So it could carry a fake message header to a stranger's inbox, signed by ROBOTAT
  and sent over ROBOTAT's sending reputation.
*/
const PHISH =
  "Ada,\n\nURGENT: your ROBOTAT account is suspended.\nConfirm at http://robotat-support.example\n\n\n\nOriginal message:";

describe("the registration open mailer", () => {
  it("refuses a name carrying a fake message body", () => {
    const result = registerSchema.safeParse({
      name: PHISH,
      email: "victim@example.com",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("refuses a single line break just as firmly — that is all the trick needs", () => {
    const result = registerSchema.safeParse({
      name: "Ada,\nYour account is suspended",
      email: "victim@example.com",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("refuses a carriage return, which is header injection in every mail format", () => {
    expect(
      registerSchema.safeParse({ name: "Ada\rBcc: everyone@example.com", email: "a@b.com", password: "password123" })
        .success,
    ).toBe(false);
  });

  it("refuses a name long enough to be a message even on one line", () => {
    expect(
      registerSchema.safeParse({ name: "A".repeat(400), email: "a@b.com", password: "password123" }).success,
    ).toBe(false);
  });

  it("still accepts the names real people have", () => {
    for (const name of ["Ada Lovelace", "عبدالله الخالدي", "Jean-Luc O'Brien", "李雷", "Ali"]) {
      const result = registerSchema.safeParse({ name, email: "a@b.com", password: "password123" });
      expect(result.success, `rejected a legitimate name: ${name}`).toBe(true);
    }
  });

  it("keeps the two-character minimum it always had", () => {
    expect(registerSchema.safeParse({ name: "A", email: "a@b.com", password: "password123" }).success).toBe(false);
  });

  it("closes the same hole on profile updates, which reach the same messages", () => {
    expect(updateProfileSchema.safeParse({ name: "Ada,\n\nURGENT: click here" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: "Ada Lovelace" }).success).toBe(true);
  });

  it("means a verification email can no longer be made to contain a second message", () => {
    // What the fix is actually for: whatever survives validation, the body stays one
    // greeting line followed by ROBOTAT's own words.
    const parsed = registerSchema.safeParse({ name: PHISH, email: "v@example.com", password: "password123" });
    expect(parsed.success).toBe(false);

    const { body } = emailVerificationMessage("Ada Lovelace", "123456", "en");
    expect(body).toContain("Hi Ada Lovelace,");
    expect(body).not.toContain("URGENT");
  });
});

describe("booking fields, which reach the business inbox and the customer", () => {
  const valid = { name: "Ada Lovelace", email: "ada@example.com" };

  it("bounds every free-text field", () => {
    expect(bookAssessmentSchema.safeParse({ ...valid, company: "C".repeat(500) }).success).toBe(false);
    expect(bookAssessmentSchema.safeParse({ ...valid, location: "L".repeat(500) }).success).toBe(false);
    expect(bookAssessmentSchema.safeParse({ ...valid, landSize: "S".repeat(500) }).success).toBe(false);
    expect(bookAssessmentSchema.safeParse({ ...valid, phone: "9".repeat(200) }).success).toBe(false);
    expect(bookAssessmentSchema.safeParse({ ...valid, message: "M".repeat(5000) }).success).toBe(false);
  });

  it("keeps line breaks out of the fields that are not prose", () => {
    expect(bookAssessmentSchema.safeParse({ ...valid, company: "Acme\nBcc: x@y.com" }).success).toBe(false);
    expect(bookAssessmentSchema.safeParse({ ...valid, location: "Farm\r\nSubject: fake" }).success).toBe(false);
  });

  it("lets the message field be prose, because that is what it is for", () => {
    const result = bookAssessmentSchema.safeParse({
      ...valid,
      message: "Two hectares, mostly date palms.\n\nThe gate is off Exit 14.\nCall before arriving.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an ordinary booking unchanged", () => {
    const result = bookAssessmentSchema.safeParse({
      ...valid,
      phone: "+966 50 123 4567",
      company: "Al-Rimal Farms",
      landSize: "12 hectares",
      location: "Al-Kharj, Riyadh Province",
      message: "Interested in the MAX T100 for date palms.",
    });
    expect(result.success).toBe(true);
  });
});

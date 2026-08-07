import { describe, it, expect } from "vitest";
import { canonicalEmail } from "../server/modules/auth/auth.service";

describe("canonicalEmail", () => {
  it("folds the Gmail alias forms onto one identity", () => {
    // All three deliver to the same mailbox, so all three are the same person.
    const target = "abdullahkh250@gmail.com";
    for (const alias of [
      "abdullahkh250@gmail.com",
      "ABDULLAHKH250@Gmail.com",
      "abdullah.kh250@gmail.com",
      "a.b.d.u.l.l.a.h.k.h.2.5.0@gmail.com",
      "abdullahkh250+farm@gmail.com",
      "abdullah.kh250+anything@GMAIL.com",
      "abdullahkh250@googlemail.com", // Google's own alias domain
    ]) {
      expect(canonicalEmail(alias)).toBe(target);
    }
  });

  it("strips +suffix on providers that document it, and leaves dots alone", () => {
    // Dots are significant outside Google — first.last@ and firstlast@ are two people.
    expect(canonicalEmail("first.last+tag@outlook.com")).toBe("first.last@outlook.com");
    expect(canonicalEmail("first.last@outlook.com")).toBe("first.last@outlook.com");
    expect(canonicalEmail("firstlast@outlook.com")).not.toBe(canonicalEmail("first.last@outlook.com"));
  });

  it("leaves an unknown domain alone apart from case", () => {
    // Merging two real people is worse than letting one alias through, so anything not
    // known to alias is compared as typed.
    expect(canonicalEmail("Sara+Farm@nasl-tech.com")).toBe("sara+farm@nasl-tech.com");
    expect(canonicalEmail("a.b@nasl-tech.com")).toBe("a.b@nasl-tech.com");
  });

  it("never produces an address with an empty local part", () => {
    // "+tag@gmail.com" would strip to "@gmail.com", which is not an address.
    expect(canonicalEmail("+tag@gmail.com")).toBe("+tag@gmail.com");
    expect(canonicalEmail("....@gmail.com")).toBe("....@gmail.com");
  });

  it("is unbothered by input that is not an address", () => {
    expect(canonicalEmail("  Not An Email ")).toBe("not an email");
    expect(canonicalEmail("@gmail.com")).toBe("@gmail.com");
  });
});

import { describe, it, expect } from "vitest";
import { allowedOrigins, isAllowedOrigin } from "../server/lib/cors";

describe("cors allowlist", () => {
  it("always allows the Capacitor origins, with no configuration", () => {
    const allowed = allowedOrigins(undefined);
    expect(isAllowedOrigin("capacitor://localhost", allowed)).toBe(true);
    expect(isAllowedOrigin("ionic://localhost", allowed)).toBe(true);
  });

  it("adds configured origins and ignores whitespace and empties", () => {
    const allowed = allowedOrigins(" https://a.example , ,https://b.example ");
    expect(isAllowedOrigin("https://a.example", allowed)).toBe(true);
    expect(isAllowedOrigin("https://b.example", allowed)).toBe(true);
    expect(allowed).not.toContain("");
  });

  it("rejects anything not listed, and is not a prefix match", () => {
    const allowed = allowedOrigins("https://robotat.example");
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin("https://robotat.example.evil.com", allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import type { Assessment } from "@shared/schema";

/**
 * APNs client and the status-change fan-out.
 *
 * There is no Apple Developer account, so real delivery cannot be exercised. That is
 * the whole reason `sendApnsNotifications` takes an injectable transport and the http2
 * call lives in exactly one function: everything below runs against a fake transport
 * and never opens a socket, and the one thing that genuinely cannot be faked — whether
 * the JWT signature is the encoding Apple accepts — is checked against real crypto.
 *
 * The database is mocked out rather than used: pruning is about which token values get
 * handed to the delete, which is fully observable at the seam.
 */

const storage = vi.hoisted(() => ({
  getTokensForUser: vi.fn(),
  deleteTokensByValue: vi.fn(),
}));

vi.mock("../server/modules/push/push.storage", () => ({
  getTokensForUser: storage.getTokensForUser,
  deleteTokensByValue: storage.deleteTokensByValue,
  upsertPushToken: vi.fn(),
  deletePushToken: vi.fn(),
  deleteTokensForUser: vi.fn(),
}));

import {
  signProviderJwt,
  getProviderJwt,
  invalidateProviderJwt,
  buildApnsPayload,
  sendApnsNotifications,
  deadTokens,
  type ApnsTransport,
  type ApnsRequest,
} from "../server/lib/apns";
import { customerStatusMessage, notifyConfigWarnings, pushCustomer, customerStatusPush } from "../server/lib/notify";

/** A real P-256 key pair — the same shape as the .p8 Apple issues. */
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const KEY_ID = "ABC1234567";
const TEAM_ID = "TEAM123456";

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
    status: "scheduled",
    scheduledAt: null,
    createdAt: new Date(),
    ...overrides,
  } as Assessment;
}

/** Put the three APNs credentials in the environment for one test. */
function configureApns(privateKeyValue: string = privateKey) {
  vi.stubEnv("APNS_TEAM_ID", TEAM_ID);
  vi.stubEnv("APNS_KEY_ID", KEY_ID);
  vi.stubEnv("APNS_PRIVATE_KEY", privateKeyValue);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  invalidateProviderJwt(); // the JWT cache is module state and outlives a test
  storage.getTokensForUser.mockReset();
  storage.deleteTokensByValue.mockReset().mockResolvedValue(0);
});

/* ============================================================
 * The provider JWT
 * ========================================================== */

describe("signProviderJwt", () => {
  const parts = (jwt: string) => {
    const [header, claims, signature] = jwt.split(".");
    return {
      header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
      claims: JSON.parse(Buffer.from(claims, "base64url").toString("utf8")),
      signingInput: Buffer.from(`${header}.${claims}`),
      signature: Buffer.from(signature, "base64url"),
    };
  };

  /** crypto.verify returns false for a signature it cannot parse — but be defensive. */
  const verifyWith = (dsaEncoding: "ieee-p1363" | "der", signingInput: Buffer, signature: Buffer) => {
    try {
      return crypto.verify("sha256", signingInput, { key: publicKey, dsaEncoding }, signature);
    } catch {
      return false;
    }
  };

  it("produces a signature Apple will actually accept (ES256 = raw r‖s, not DER)", () => {
    const jwt = signProviderJwt({ keyPem: privateKey, keyId: KEY_ID, teamId: TEAM_ID, now: 1_700_000_000_000 });
    const { signingInput, signature } = parts(jwt);

    // JWS ES256 (RFC 7518 §3.4) is the fixed-width concatenation of r and s: for P-256
    // that is exactly 32 + 32 bytes. A DER signature is an ASN.1 SEQUENCE and comes out
    // around 70-72 bytes, and its length varies run to run — so this length assertion
    // alone rules the DER encoding out.
    expect(signature).toHaveLength(64);

    // The real proof: the signature verifies in p1363 mode...
    expect(verifyWith("ieee-p1363", signingInput, signature)).toBe(true);
    // ...and does NOT verify when interpreted as DER, which is Node's default output
    // format and what Apple rejects with a 403 InvalidProviderToken that looks for all
    // the world like wrong credentials. If someone drops the dsaEncoding option, the
    // assertion above flips to false and this one flips to true.
    expect(verifyWith("der", signingInput, signature)).toBe(false);
  });

  it("carries the header and claims APNs requires", () => {
    const jwt = signProviderJwt({ keyPem: privateKey, keyId: KEY_ID, teamId: TEAM_ID, now: 1_700_000_000_000 });
    const { header, claims } = parts(jwt);

    expect(header).toEqual({ alg: "ES256", kid: KEY_ID });
    expect(claims).toEqual({ iss: TEAM_ID, iat: 1_700_000_000 }); // seconds, not milliseconds
  });

  it("encodes base64url with no padding", () => {
    // A '+', '/' or '=' anywhere in the token makes it an invalid JWT. Signatures are
    // random per call, so sign a few times to actually exercise the character set.
    for (let i = 0; i < 20; i++) {
      const jwt = signProviderJwt({ keyPem: privateKey, keyId: KEY_ID, teamId: TEAM_ID });
      expect(jwt).not.toMatch(/[+/=]/);
      expect(jwt.split(".")).toHaveLength(3);
    }
  });
});

describe("getProviderJwt", () => {
  it("reuses one token rather than signing on every send", () => {
    // Apple rejects provider tokens refreshed more often than once every 20 minutes,
    // so signing per notification is not merely wasteful — it gets you throttled.
    configureApns();
    expect(getProviderJwt()).toBe(getProviderJwt());
  });

  it("signs a new one after the cache is invalidated", () => {
    configureApns();
    const first = getProviderJwt();
    invalidateProviderJwt(first);
    expect(getProviderJwt()).not.toBe(first);
  });

  it("only invalidates when the token handed back is the one it holds", () => {
    // Concurrent sends all get their own 403 for the same expired JWT. Without this
    // guard each would throw away the replacement the previous one just signed.
    configureApns();
    const current = getProviderJwt();
    invalidateProviderJwt("some-older-token");
    expect(getProviderJwt()).toBe(current);
  });

  it("accepts a p8 pasted as one line with literal \\n escapes", () => {
    // How the key invariably arrives: environment variables cannot hold real newlines.
    configureApns(privateKey.replace(/\n/g, "\\n"));
    expect(() => getProviderJwt()).not.toThrow();
    expect(getProviderJwt().split(".")).toHaveLength(3);
  });

  it("throws when the credentials are absent (callers must check apnsConfigured first)", () => {
    expect(() => getProviderJwt()).toThrow(/not configured/i);
  });
});

/* ============================================================
 * Payload
 * ========================================================== */

describe("buildApnsPayload", () => {
  it("uses the push wording, not the email body", () => {
    const a = fixture({ status: "scheduled", scheduledAt: new Date("2026-09-01T07:30:00Z") });
    const payload = buildApnsPayload(a);

    expect(payload.aps.alert).toEqual(customerStatusPush(a));
  });

  it("keeps the greeting and signature out of the lock screen", () => {
    // This is why push has its own builder. Reusing customerStatusMessage put "Hi Sara,"
    // and "— ROBOTAT by NASL" into the alert, so iOS collapsed it to "Hi Sara, Good
    // news — your site assessment (#7) has been…" — a truncated letter, not a notice.
    const a = fixture({ name: "Sara", status: "scheduled", scheduledAt: new Date("2026-09-01T07:30:00Z") });
    const { title, body } = buildApnsPayload(a).aps.alert;

    expect(body).not.toContain("Hi Sara");
    expect(body).not.toContain("ROBOTAT by NASL");
    expect(body).not.toContain("\n");
    // Roughly what iOS shows before truncating a title.
    expect(title.length).toBeLessThanOrEqual(40);
    // The detail still has to survive: which booking, and when.
    expect(body).toContain("#7");
    expect(body).toContain("2026");
  });

  it("asks for a sound and carries the keys the app deep-links on", () => {
    const payload = buildApnsPayload(fixture({ id: 42, status: "completed" }));
    expect(payload.aps.sound).toBe("default");
    expect(payload.assessmentId).toBe(42);
    expect(payload.status).toBe("completed");
  });
});

/* ============================================================
 * Sending, retrying and pruning
 * ========================================================== */

/** A transport that answers from a per-token script and records what it was asked. */
function fakeTransport(byToken: Record<string, { status: number; reason?: string }[]>) {
  const calls: ApnsRequest[] = [];
  const cursor: Record<string, number> = {};
  const transport: ApnsTransport = async (req) => {
    calls.push(req);
    const script = byToken[req.deviceToken] ?? [{ status: 200 }];
    const i = Math.min(cursor[req.deviceToken] ?? 0, script.length - 1);
    cursor[req.deviceToken] = i + 1;
    return script[i];
  };
  return { transport, calls };
}

describe("sendApnsNotifications", () => {
  it("addresses each device with the topic, push type and priority APNs requires", async () => {
    configureApns();
    const { transport, calls } = fakeTransport({});
    await sendApnsNotifications(["dev-a"], buildApnsPayload(fixture()), transport);

    expect(calls).toHaveLength(1);
    expect(calls[0].topic).toBe("com.nasl.robotat");
    expect(calls[0].deviceToken).toBe("dev-a");
    // Sandbox by default: Xcode development builds carry sandbox device tokens, and
    // pointing those at the production host fails with BadDeviceToken every time.
    expect(calls[0].host).toContain("sandbox");
  });

  it("uses the production host only when APNS_ENV says so", async () => {
    configureApns();
    vi.stubEnv("APNS_ENV", "production");
    const { transport, calls } = fakeTransport({});
    await sendApnsNotifications(["dev-a"], buildApnsPayload(fixture()), transport);
    expect(calls[0].host).toBe("https://api.push.apple.com");
  });

  it("retries an expired provider token exactly once, with a fresh JWT", async () => {
    configureApns();
    const { transport, calls } = fakeTransport({
      "dev-a": [{ status: 403, reason: "ExpiredProviderToken" }, { status: 200 }],
    });

    const [result] = await sendApnsNotifications(["dev-a"], buildApnsPayload(fixture()), transport);

    expect(calls).toHaveLength(2); // one retry, not a loop
    expect(calls[1].jwt).not.toBe(calls[0].jwt); // and genuinely re-signed
    expect(result.ok).toBe(true);
  });

  it("gives up after the single retry when the 403 persists", async () => {
    configureApns();
    const { transport, calls } = fakeTransport({
      "dev-a": [{ status: 403, reason: "ExpiredProviderToken" }],
    });

    const [result] = await sendApnsNotifications(["dev-a"], buildApnsPayload(fixture()), transport);

    expect(calls).toHaveLength(2);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it("does not retry a 403 that re-signing cannot fix", async () => {
    // InvalidProviderToken is a wrong key id or team id — a second identical attempt
    // just doubles the load on a request that was never going to succeed.
    configureApns();
    const { transport, calls } = fakeTransport({
      "dev-a": [{ status: 403, reason: "InvalidProviderToken" }],
    });

    await sendApnsNotifications(["dev-a"], buildApnsPayload(fixture()), transport);
    expect(calls).toHaveLength(1);
  });

  it("turns a thrown transport error into a failed result rather than rejecting", async () => {
    configureApns();
    const transport: ApnsTransport = async () => {
      throw new Error("socket hang up");
    };
    const results = await sendApnsNotifications(["dev-a"], buildApnsPayload(fixture()), transport);
    expect(results).toEqual([{ token: "dev-a", ok: false, reason: "socket hang up" }]);
  });
});

describe("deadTokens", () => {
  it("selects only what APNs says is permanently gone", () => {
    const dead = deadTokens([
      { token: "gone-410", ok: false, status: 410, reason: "Unregistered" },
      { token: "bad", ok: false, status: 400, reason: "BadDeviceToken" },
      { token: "wrong-topic", ok: false, status: 400, reason: "DeviceTokenNotForTopic" },
      { token: "alive", ok: true, status: 200 },
      // Transient — Apple having a bad minute must not unsubscribe a live phone.
      { token: "busy", ok: false, status: 429, reason: "TooManyRequests" },
      { token: "down", ok: false, status: 503, reason: "ServiceUnavailable" },
      { token: "timeout", ok: false, reason: "APNs request timed out" },
    ]);
    expect(dead).toEqual(["gone-410", "bad", "wrong-topic"]);
  });
});

/* ============================================================
 * The fan-out
 * ========================================================== */

describe("pushCustomer", () => {
  it("sends to every registered device and prunes exactly the dead ones", async () => {
    configureApns();
    storage.getTokensForUser.mockResolvedValue([
      { token: "live-device", platform: "ios" },
      { token: "dead-device", platform: "ios" },
    ]);

    const { transport, calls } = fakeTransport({
      "live-device": [{ status: 200 }],
      "dead-device": [{ status: 410, reason: "Unregistered" }],
    });

    await pushCustomer(fixture({ userId: 5 }), transport);

    expect(storage.getTokensForUser).toHaveBeenCalledWith(5);
    expect(calls.map((c) => c.deviceToken).sort()).toEqual(["dead-device", "live-device"]);

    // Exactly the dead one: pruning the live device would silently unsubscribe a phone
    // that is working fine, and leaving the dead one means retrying it forever.
    expect(storage.deleteTokensByValue).toHaveBeenCalledTimes(1);
    expect(storage.deleteTokensByValue).toHaveBeenCalledWith(["dead-device"]);
  });

  it("does not touch the database when every device is healthy", async () => {
    configureApns();
    storage.getTokensForUser.mockResolvedValue([{ token: "live-device", platform: "ios" }]);
    const { transport } = fakeTransport({ "live-device": [{ status: 200 }] });

    await pushCustomer(fixture(), transport);
    expect(storage.deleteTokensByValue).not.toHaveBeenCalled();
  });

  it("sends only to iOS devices", async () => {
    configureApns();
    storage.getTokensForUser.mockResolvedValue([
      { token: "iphone", platform: "ios" },
      { token: "pixel", platform: "android" },
      { token: "chrome", platform: "web" },
    ]);
    const { transport, calls } = fakeTransport({ iphone: [{ status: 200 }] });

    await pushCustomer(fixture(), transport);

    // An FCM token POSTed to Apple comes back BadDeviceToken, which `deadTokens` reads
    // as "this device is gone" — so without the filter the first Android registration
    // would be silently deleted by the iOS sender.
    expect(calls.map((c) => c.deviceToken)).toEqual(["iphone"]);
    expect(storage.deleteTokensByValue).not.toHaveBeenCalled();
  });

  it("is a no-op when the customer has no iOS device at all", async () => {
    configureApns();
    storage.getTokensForUser.mockResolvedValue([{ token: "pixel", platform: "android" }]);
    const { transport, calls } = fakeTransport({});

    await pushCustomer(fixture(), transport);

    expect(calls).toHaveLength(0);
    expect(storage.deleteTokensByValue).not.toHaveBeenCalled();
  });

  it("sends nothing for an assessment whose owner deleted their account", async () => {
    // Account deletion anonymises the booking instead of removing it, so user_id is
    // NULL. There is nobody to notify, and this must not blow up the status change.
    configureApns();
    const { transport, calls } = fakeTransport({});

    await expect(pushCustomer(fixture({ userId: null }), transport)).resolves.toBeUndefined();

    expect(calls).toHaveLength(0);
    expect(storage.getTokensForUser).not.toHaveBeenCalled();
    expect(storage.deleteTokensByValue).not.toHaveBeenCalled();
  });

  it("degrades quietly when APNs is not configured", async () => {
    // The normal state in development and in this test suite. No credentials means no
    // send — and, critically, no throw: a push that cannot go out must not fail the
    // status change that triggered it.
    const { transport, calls } = fakeTransport({});

    await expect(pushCustomer(fixture(), transport)).resolves.toBeUndefined();

    expect(calls).toHaveLength(0);
    expect(storage.getTokensForUser).not.toHaveBeenCalled();
  });

  it("is a no-op for a customer with no registered devices", async () => {
    configureApns();
    storage.getTokensForUser.mockResolvedValue([]);
    const { transport, calls } = fakeTransport({});

    await pushCustomer(fixture(), transport);
    expect(calls).toHaveLength(0);
  });
});

describe("notifyConfigWarnings — APNs", () => {
  it("flags a half-configured credential set", () => {
    const warnings = notifyConfigWarnings({ APNS_TEAM_ID: "T", APNS_KEY_ID: "K" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("APNS_PRIVATE_KEY");
  });

  it("stays quiet when all three are set, and when none are", () => {
    expect(notifyConfigWarnings({ APNS_TEAM_ID: "T", APNS_KEY_ID: "K", APNS_PRIVATE_KEY: "P" })).toEqual([]);
    expect(notifyConfigWarnings({})).toEqual([]);
  });
});

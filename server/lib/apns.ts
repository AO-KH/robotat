import http2 from "node:http2";
import crypto from "node:crypto";
import type { Assessment } from "@shared/schema";
import { customerStatusPush } from "./messages";
import { log } from "./log";

/**
 * Apple Push Notification service client, hand-rolled on node:http2 + node:crypto.
 *
 * No dependency: `node-apn` is unmaintained, and the whole protocol is one HTTP/2
 * POST carrying a JWT. The fan-out here is a handful of devices per status change,
 * so a short-lived session per send is the right shape — no connection pool, no PING
 * keepalive, nothing to leak between requests.
 *
 * Like `notify.ts`, every path degrades: with no credentials configured this logs and
 * returns rather than throwing, because a push that cannot be sent must never fail the
 * status change that triggered it.
 *
 * NOTE ON THE IMPORT CYCLE: this module imports `customerStatusMessage` from notify.ts
 * and notify.ts imports the senders from here. That is a real ESM cycle, and it is safe
 * only because everything crossing it is a hoisted function declaration called at
 * request time — nothing runs at module scope. Do not add top-level work that calls
 * across the boundary.
 */

/** Bundle identifier of the Capacitor iOS app; the APNs topic. */
const DEFAULT_BUNDLE_ID = "com.nasl.robotat";

/**
 * Refresh interval for the provider JWT.
 *
 * Apple requires a token to be refreshed no more often than every 20 minutes and no
 * less often than every 60. Fifty minutes sits inside that window with enough slack
 * that clock skew on either side cannot push us out of it.
 */
const JWT_TTL_MS = 50 * 60 * 1000;

/** Per-request ceiling. APNs answers in tens of milliseconds; 10s means "it is gone". */
const REQUEST_TIMEOUT_MS = 10_000;

/* ============================================================
 * Configuration
 * ========================================================== */

/**
 * The p8 signing key, with literal `\n` escapes turned back into newlines.
 *
 * Environment variables cannot hold real newlines in most deployment targets (Docker
 * `--env`, systemd units, the App Store CI secrets UI), so a PEM is invariably pasted
 * as a single line with `\n` escapes. Left un-normalised, OpenSSL rejects it with an
 * opaque "no start line" error.
 */
function apnsPrivateKey(): string | undefined {
  const raw = process.env.APNS_PRIVATE_KEY;
  if (!raw) return undefined;
  return raw.replace(/\\n/g, "\n");
}

/**
 * Which APNs environment to talk to.
 *
 * Sandbox unless APNS_ENV is explicitly "production". This default matters: a build
 * signed with a development provisioning profile — which is every build run from Xcode
 * and every TestFlight-adjacent debug install — registers a SANDBOX device token.
 * Sending it to the production host fails with `BadDeviceToken`, so defaulting to
 * production would make every notification silently vanish during development, which
 * is exactly when you need to see them.
 */
function apnsHost(): string {
  return process.env.APNS_ENV === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
}

/** The APNs topic — the iOS app's bundle id. */
function apnsTopic(): string {
  return process.env.APNS_BUNDLE_ID || DEFAULT_BUNDLE_ID;
}

/** True when all three signing credentials are present. */
export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_TEAM_ID && process.env.APNS_KEY_ID && apnsPrivateKey());
}

/* ============================================================
 * Provider authentication token (ES256 JWT)
 * ========================================================== */

/** base64url, unpadded — what JWT requires and what `base64` does not give you. */
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sign an APNs provider JWT. Pure — `now` is injectable so tests are deterministic.
 *
 * THE ONE THING THAT MATTERS HERE IS `dsaEncoding: "ieee-p1363"`.
 *
 * Node's default ECDSA output is DER: an ASN.1 SEQUENCE of two INTEGERs, variable
 * length, ~70 bytes. JWS ES256 (RFC 7518 §3.4) is defined as the raw fixed-width
 * concatenation r‖s, exactly 64 bytes for P-256 — that is "ieee-p1363". Hand a DER
 * signature to Apple and it answers 403 `InvalidProviderToken`, which reads like a
 * wrong key id or a wrong team id and sends you hunting through the developer portal
 * for hours. The credentials are fine; the encoding is not.
 */
export function signProviderJwt(opts: {
  keyPem: string;
  keyId: string;
  teamId: string;
  now?: number;
}): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: opts.keyId }));
  const claims = base64url(JSON.stringify({ iss: opts.teamId, iat }));
  const signingInput = `${header}.${claims}`;

  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: opts.keyPem,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64url(signature)}`;
}

let cachedJwt: { token: string; issuedAt: number } | null = null;

/** The current provider JWT, signing a new one only once every ~50 minutes. */
export function getProviderJwt(now = Date.now()): string {
  const keyPem = apnsPrivateKey();
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyPem || !keyId || !teamId) {
    throw new Error("APNs is not configured (APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY)");
  }

  if (cachedJwt && now - cachedJwt.issuedAt < JWT_TTL_MS) return cachedJwt.token;

  const token = signProviderJwt({ keyPem, keyId, teamId, now });
  cachedJwt = { token, issuedAt: now };
  return token;
}

/**
 * Drop the cached JWT so the next call signs a fresh one.
 *
 * Pass the token you believe is stale. Sends run concurrently, so when a JWT really has
 * expired every in-flight request gets its own 403 at the same moment; without the
 * guard each one would invalidate the replacement the previous one just signed, and a
 * burst of re-signs is how you earn `TooManyProviderTokenUpdates` from Apple. Matching
 * on the stale value means only the first 403 re-signs and the rest reuse the result.
 */
export function invalidateProviderJwt(stale?: string): void {
  if (!stale || cachedJwt?.token === stale) cachedJwt = null;
}

/* ============================================================
 * Payload
 * ========================================================== */

export interface ApnsPayload {
  aps: {
    alert: { title: string; body: string };
    sound: string;
  };
  /** Custom keys the app reads to deep-link straight to the booking. */
  assessmentId: number;
  status: string;
}

/**
 * The notification for a booking status change. Pure/testable.
 *
 * The wording comes from `customerStatusMessage` rather than a second copy of it, so
 * the push, the email and the WhatsApp notice cannot drift apart.
 */
export function buildApnsPayload(a: Assessment): ApnsPayload {
  // customerStatusPush, not customerStatusMessage: the email body opens with a
  // greeting and closes with a signature, which iOS collapsed on the lock screen into
  // "Hi Sara, Good news — your site assessment (#7) has been…" — a truncated letter
  // rather than a notification.
  const { title, body } = customerStatusPush(a);
  return {
    aps: { alert: { title, body }, sound: "default" },
    assessmentId: a.id,
    status: a.status,
  };
}

/* ============================================================
 * Transport
 * ========================================================== */

export interface ApnsRequest {
  /** Origin of the APNs host, e.g. https://api.sandbox.push.apple.com */
  host: string;
  /** The device token this notification is addressed to. */
  deviceToken: string;
  /** The provider JWT to authenticate with. */
  jwt: string;
  topic: string;
  payload: ApnsPayload;
}

export interface ApnsHttpResponse {
  status: number;
  /** Apple's machine-readable failure reason, e.g. "Unregistered". */
  reason?: string;
}

export type ApnsTransport = (req: ApnsRequest) => Promise<ApnsHttpResponse>;

export interface ApnsResult {
  token: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

/**
 * The ONLY function in this module that opens a socket.
 *
 * Everything above it is pure or injectable, which is what lets the tests exercise the
 * JWT, the payload, the retry and the pruning without an Apple Developer account and
 * without touching the network.
 */
export const httpTransport: ApnsTransport = (req) =>
  new Promise<ApnsHttpResponse>((resolve, reject) => {
    const session = http2.connect(req.host);
    let settled = false;

    const succeed = (value: ApnsHttpResponse) => {
      if (settled) return;
      settled = true;
      session.close();
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      session.destroy();
      reject(err);
    };

    session.on("error", fail);

    const stream = session.request({
      ":method": "POST",
      ":path": `/3/device/${req.deviceToken}`,
      authorization: `bearer ${req.jwt}`,
      "apns-topic": req.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    stream.setTimeout(REQUEST_TIMEOUT_MS, () => fail(new Error("APNs request timed out")));
    stream.on("error", fail);

    let status = 0;
    stream.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });

    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      let reason: string | undefined;
      if (body) {
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason;
        } catch {
          reason = body.slice(0, 200);
        }
      }
      succeed({ status, reason });
    });

    stream.end(JSON.stringify(req.payload));
  });

/* ============================================================
 * Send
 * ========================================================== */

/**
 * Deliver one payload to many devices. Never throws — a per-device failure becomes a
 * result row so the caller can prune dead tokens and carry on.
 *
 * `transport` is injectable purely so tests never open a socket.
 */
export async function sendApnsNotifications(
  tokens: string[],
  payload: ApnsPayload,
  transport: ApnsTransport = httpTransport,
): Promise<ApnsResult[]> {
  if (tokens.length === 0) return [];

  const host = apnsHost();
  const topic = apnsTopic();

  return Promise.all(
    tokens.map(async (deviceToken): Promise<ApnsResult> => {
      try {
        const jwt = getProviderJwt();
        let res = await transport({ host, deviceToken, jwt, topic, payload });

        /*
          Exactly one retry, and only for this one reason.

          `ExpiredProviderToken` means the JWT aged out between being cached and being
          used — a fresh one fixes it. Every other 403 (`InvalidProviderToken`,
          `MissingProviderToken`) is a configuration fault that re-signing cannot
          repair, so retrying those would just double the load while still failing.
        */
        if (res.status === 403 && res.reason === "ExpiredProviderToken") {
          invalidateProviderJwt(jwt);
          res = await transport({ host, deviceToken, jwt: getProviderJwt(), topic, payload });
        }

        return {
          token: deviceToken,
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          reason: res.reason,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`[apns] send failed for …${deviceToken.slice(-8)}: ${message}`, "notify");
        return { token: deviceToken, ok: false, reason: message };
      }
    }),
  );
}

/**
 * Reasons that mean the device is gone for good, so the token should be deleted.
 *
 * `BadDeviceToken` — not a token for this environment or this app any more.
 * `Unregistered` — the app was deleted (APNs pairs this with HTTP 410).
 * `DeviceTokenNotForTopic` — registered against a different bundle id.
 *
 * Everything else (503, timeouts, `TooManyRequests`) is transient: deleting on those
 * would unsubscribe a live phone because Apple had a bad minute.
 */
const DEAD_TOKEN_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

/** The subset of results whose tokens should be deleted from the database. */
export function deadTokens(results: ApnsResult[]): string[] {
  return results
    .filter((r) => !r.ok && (r.status === 410 || (r.reason ? DEAD_TOKEN_REASONS.has(r.reason) : false)))
    .map((r) => r.token);
}

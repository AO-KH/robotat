import { describe, it, expect } from "vitest";
import { sendViaResend, notifyConfigWarnings } from "../server/lib/notify";

/*
  Railway drops outbound SMTP — 25, 465 and 587 all time out from a container while all
  three answer in about 40ms from a laptop — and reports it only as "Connection timeout".
  No port, host or DNS setting gets around a platform firewall, so mail leaves over HTTPS
  on 443 instead. These cover the transport itself; none of them touch the network.
*/

/** A fetch that records what it was asked to do and answers however the test wants. */
function recordingFetch(response: { ok: boolean; status?: number; body?: string }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      text: async () => response.body ?? "",
    } as Response;
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const BASE = {
  apiKey: "re_test_key",
  from: "ROBOTAT <info@nasl-tech.com>",
  to: "customer@example.com",
  subject: "123456 is your ROBOTAT confirmation code",
  text: "Hi Ada,\n\nYour code is 123456.",
};

describe("sendViaResend", () => {
  it("posts the message and authenticates with the key", async () => {
    const { calls, impl } = recordingFetch({ ok: true });
    await sendViaResend({ ...BASE, fetchImpl: impl });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.method).toBe("POST");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({
      from: "ROBOTAT <info@nasl-tech.com>",
      to: ["customer@example.com"],
      subject: "123456 is your ROBOTAT confirmation code",
      text: "Hi Ada,\n\nYour code is 123456.",
    });
  });

  it("sends reply_to only when there is one", async () => {
    const withReply = recordingFetch({ ok: true });
    await sendViaResend({ ...BASE, replyTo: "farmer@example.com", fetchImpl: withReply.impl });
    expect(JSON.parse(String(withReply.calls[0].init.body)).reply_to).toBe("farmer@example.com");

    const without = recordingFetch({ ok: true });
    await sendViaResend({ ...BASE, fetchImpl: without.impl });
    expect(JSON.parse(String(without.calls[0].init.body))).not.toHaveProperty("reply_to");
  });

  it("gives up the request rather than hanging on a stalled connection", async () => {
    const { calls, impl } = recordingFetch({ ok: true });
    await sendViaResend({ ...BASE, fetchImpl: impl });
    // Without this the caller waits indefinitely — resend-verification awaits the send,
    // which is how one dead SMTP connection once held a request open for 122 seconds.
    expect(calls[0].init.signal).toBeDefined();
  });

  it("throws with the provider's own explanation, because the status alone is not a cause", async () => {
    const { impl } = recordingFetch({
      ok: false,
      status: 422,
      body: '{"message":"The nasl-tech.com domain is not verified"}',
    });
    await expect(sendViaResend({ ...BASE, fetchImpl: impl })).rejects.toThrow(/422/);
    await expect(sendViaResend({ ...BASE, fetchImpl: impl })).rejects.toThrow(/not verified/);
  });

  it("still reports the status when the body cannot be read", async () => {
    const impl = (async () =>
      ({
        ok: false,
        status: 401,
        text: async () => {
          throw new Error("stream already consumed");
        },
      }) as unknown as Response) as unknown as typeof fetch;

    // A 401 that surfaces as a stream error would send someone debugging the wrong thing.
    await expect(sendViaResend({ ...BASE, fetchImpl: impl })).rejects.toThrow(/401/);
  });
});

describe("boot warnings about the mail transport", () => {
  const prod = (over: NodeJS.ProcessEnv = {}) => ({ NODE_ENV: "production", ...over }) as NodeJS.ProcessEnv;

  it("does not warn about SMTP when mail goes over HTTPS", async () => {
    const warnings = notifyConfigWarnings(prod({ RESEND_API_KEY: "re_x", ASSESSMENT_INBOX: "ops@nasl-tech.com" }));
    expect(warnings.join(" ")).not.toMatch(/SMTP_HOST/);
  });

  it("warns when neither transport is configured", () => {
    const warnings = notifyConfigWarnings(prod({ ASSESSMENT_INBOX: "ops@nasl-tech.com" }));
    expect(warnings.join(" ")).toMatch(/RESEND_API_KEY nor SMTP_HOST/);
  });

  it("says which one wins when both are set, rather than leaving it to be discovered", () => {
    const warnings = notifyConfigWarnings(
      prod({ RESEND_API_KEY: "re_x", SMTP_HOST: "smtp.example.com", ASSESSMENT_INBOX: "ops@nasl-tech.com" }),
    );
    expect(warnings.join(" ")).toMatch(/SMTP_\* settings are unused/);
  });
});

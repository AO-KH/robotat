import "dotenv/config";
import nodemailer from "nodemailer";

/**
 * Prove the SMTP configuration in .env actually works, by sending one real email.
 *
 * Email is the one delivery channel that fails silently by design: every send here is
 * best-effort so a mail outage cannot fail a booking. That is correct, and it means a
 * wrong password looks exactly like a working system until someone notices a customer
 * never got their confirmation. This is the check that closes that gap.
 *
 *   npm run mail:test
 *
 * Reads the credentials from .env and never prints them. On failure it maps the
 * common SMTP errors to what they usually mean, because "535 5.7.8" is not a useful
 * thing to be handed.
 */

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_REDIRECT_TO } = process.env;

/** Show enough of an address to recognise it, not enough to harvest it. */
function mask(address: string | undefined): string {
  if (!address) return "(unset)";
  const [local, domain] = address.split("@");
  if (!domain) return "(malformed)";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

async function main(): Promise<void> {
  if (!SMTP_HOST) {
    console.error(`
SMTP_HOST is not set, so nothing would be sent — emails are only written to the
server log. Fill in SMTP_HOST, SMTP_USER and SMTP_PASS in .env and run this again.

Gmail needs an App Password, not your account password:
  https://myaccount.google.com/apppasswords  (2-Step Verification must be on)
`);
    process.exitCode = 1;
    return;
  }

  const to = MAIL_REDIRECT_TO || SMTP_USER;
  if (!to) {
    console.error("Set MAIL_REDIRECT_TO (or SMTP_USER) so there is somewhere to send the test.");
    process.exitCode = 1;
    return;
  }

  const port = Number(SMTP_PORT || 587);

  // The same IPv4 pinning the server does, so this reports on the connection production
  // will actually open rather than on a different one. See smtpEndpoint's note.
  const { smtpEndpoint } = await import("../server/lib/notify");
  const endpoint = await smtpEndpoint(SMTP_HOST);

  console.log(`host      ${SMTP_HOST}:${port}${port === 465 ? " (implicit TLS)" : " (STARTTLS)"}`);
  if (endpoint.host !== SMTP_HOST) console.log(`resolved  ${endpoint.host} (IPv4, SNI ${SMTP_HOST})`);
  console.log(`user      ${mask(SMTP_USER)}`);
  console.log(`password  ${SMTP_PASS ? `set, ${SMTP_PASS.length} characters` : "NOT SET"}`);
  console.log(`sending   ${mask(to)}\n`);

  const transport = nodemailer.createTransport({
    host: endpoint.host,
    ...(endpoint.servername ? { tls: { servername: endpoint.servername } } : {}),
    port,
    secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    // verify() does the connect + handshake + auth without sending, so a credential
    // problem is reported as one rather than as a failed send.
    await transport.verify();
    console.log("connection and credentials OK");
  } catch (err) {
    explain(err);
    process.exitCode = 1;
    return;
  }

  try {
    const info = await transport.sendMail({
      from: SMTP_USER || "robotat@nasl-tech.com",
      to,
      subject: "ROBOTAT SMTP test",
      text:
        "If you are reading this, ROBOTAT can send email.\n\n" +
        "While MAIL_REDIRECT_TO is set, every message — booking confirmations, status\n" +
        "updates, password resets, confirmation codes — comes here instead of to the\n" +
        "customer, with their address shown in the subject like [-> them@example.com].\n\n" +
        "Delete MAIL_REDIRECT_TO from .env when you want customers to receive their own.\n",
    });
    console.log(`sent, message id ${info.messageId}`);
    console.log(`\nCheck ${mask(to)} — including the spam folder, which is where a first`);
    console.log("message from a new sender usually lands.");
  } catch (err) {
    explain(err);
    process.exitCode = 1;
  }
}

/** Translate the SMTP errors that actually happen into what to do about them. */
function explain(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code ?? "";

  console.error(`\nfailed: ${message}\n`);

  if (/Missing credentials/i.test(message)) {
    console.error(
      [
        "SMTP_PASS is empty. Everything else reached Gmail and negotiated TLS, so the",
        "password is the only thing missing.",
        "",
        "It must be a Google App Password, not your account password:",
        "  1. Turn on 2-Step Verification on the account",
        "  2. Create one at https://myaccount.google.com/apppasswords",
        "  3. Paste the 16 characters into SMTP_PASS with the spaces removed",
      ].join("\n"),
    );
  } else if (/535|Username and Password not accepted|Invalid login/i.test(message)) {
    console.error(
      "That is an authentication rejection. For Gmail it almost always means SMTP_PASS\n" +
        "is the account password rather than an App Password, or the App Password still\n" +
        "has its spaces in — paste it without them.",
    );
  } else if (code === "ENOTFOUND" || /getaddrinfo/i.test(message)) {
    console.error("The hostname did not resolve. Check SMTP_HOST for a typo.");
  } else if (code === "ETIMEDOUT" || code === "ECONNREFUSED") {
    console.error(
      "Nothing answered on that port. Try 587 (STARTTLS) or 465 (implicit TLS); some\n" +
        "networks block outbound 25 and 587 entirely.",
    );
  } else if (/self.signed|certificate/i.test(message)) {
    console.error("A TLS certificate problem — usually the wrong port for the host.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

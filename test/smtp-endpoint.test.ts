import { describe, it, expect } from "vitest";
import { smtpEndpoint } from "../server/lib/notify";

/*
  nodemailer resolves the SMTP host itself and then picks between the A and AAAA records
  without a stable order — three consecutive calls for smtp.hostinger.com returned the
  IPv4 address, then the IPv6 one, then the IPv6 one again.

  On a host with no IPv6 route that is not a clean failure, it is a coin toss: every send
  died with `connect ENETUNREACH 2606:4700:…:465` on the boot that drew the AAAA, and
  would have worked on the boot that drew the A. These pin the choice.
*/
describe("smtpEndpoint", () => {
  it("pins to the IPv4 address and keeps the hostname for SNI", async () => {
    const endpoint = await smtpEndpoint("smtp.example.com", async () => ["172.65.255.143"]);
    expect(endpoint).toEqual({ host: "172.65.255.143", servername: "smtp.example.com" });
  });

  it("takes the first A record when a host publishes several", async () => {
    const endpoint = await smtpEndpoint("smtp.example.com", async () => ["10.0.0.1", "10.0.0.2"]);
    expect(endpoint.host).toBe("10.0.0.1");
  });

  it("leaves an address alone when one was configured directly", async () => {
    // net.isIP short-circuits: nodemailer skips its own resolution for an IP, and there is
    // no name to validate a certificate against, so no servername is invented.
    const endpoint = await smtpEndpoint("172.65.255.143", async () => {
      throw new Error("must not resolve an address that is already an address");
    });
    expect(endpoint).toEqual({ host: "172.65.255.143" });
  });

  it("leaves an IPv6 literal alone too", async () => {
    const endpoint = await smtpEndpoint("2606:4700:90::1", async () => {
      throw new Error("must not resolve");
    });
    expect(endpoint).toEqual({ host: "2606:4700:90::1" });
  });

  it("falls back to the hostname when there is no A record", async () => {
    // An IPv6-only server must still be reachable: this prefers IPv4, it does not demand
    // it. Handing the name back lets nodemailer resolve as it always did.
    const endpoint = await smtpEndpoint("ipv6only.example.com", async () => {
      throw Object.assign(new Error("queryA ENODATA"), { code: "ENODATA" });
    });
    expect(endpoint).toEqual({ host: "ipv6only.example.com" });
  });

  it("falls back when the resolver returns nothing at all", async () => {
    const endpoint = await smtpEndpoint("empty.example.com", async () => []);
    expect(endpoint).toEqual({ host: "empty.example.com" });
  });

  it("does not throw when DNS is broken — a send should fail as a send, not here", async () => {
    await expect(
      smtpEndpoint("broken.example.com", async () => {
        throw new Error("EAI_AGAIN");
      }),
    ).resolves.toEqual({ host: "broken.example.com" });
  });
});

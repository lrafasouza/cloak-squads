import { describe, expect, test } from "vitest";
import { UnsafeOutboundUrlError, assertSafeOutboundUrl } from "../../apps/web/lib/safe-url";

describe("assertSafeOutboundUrl — accepted", () => {
  test("plain https public host", () => {
    expect(() => assertSafeOutboundUrl("https://hooks.slack.com/services/abc")).not.toThrow();
  });

  test("https with explicit port 443", () => {
    expect(() => assertSafeOutboundUrl("https://example.com:443/path")).not.toThrow();
  });

  test("returns parsed URL on success", () => {
    const url = assertSafeOutboundUrl("https://api.example.com/webhook");
    expect(url.hostname).toBe("api.example.com");
    expect(url.protocol).toBe("https:");
  });

  test("subdomain of public TLD", () => {
    expect(() =>
      assertSafeOutboundUrl("https://team.notifications.discord.com/api/webhook"),
    ).not.toThrow();
  });
});

describe("assertSafeOutboundUrl — scheme + port + credentials", () => {
  test("rejects http:// by default (https-only)", () => {
    expect(() => assertSafeOutboundUrl("http://example.com/")).toThrow(/scheme/);
  });

  test("accepts http:// when explicitly allowed", () => {
    expect(() =>
      assertSafeOutboundUrl("http://example.com/", { allowedSchemes: ["http:", "https:"] }),
    ).not.toThrow();
  });

  test("rejects file://", () => {
    expect(() => assertSafeOutboundUrl("file:///etc/passwd")).toThrow(/scheme/);
  });

  test("rejects javascript:", () => {
    expect(() => assertSafeOutboundUrl("javascript:alert(1)")).toThrow(/scheme/);
  });

  test("rejects gopher:// (smuggled smtp)", () => {
    expect(() => assertSafeOutboundUrl("gopher://example.com:25/_HELO")).toThrow(/scheme/);
  });

  test("rejects userinfo in URL", () => {
    expect(() => assertSafeOutboundUrl("https://attacker:pwd@example.com/")).toThrow(/credentials/);
  });

  test("rejects non-default port", () => {
    expect(() => assertSafeOutboundUrl("https://example.com:8080/")).toThrow(/port/);
  });
});

describe("assertSafeOutboundUrl — IPv4 private ranges", () => {
  test.each([
    "https://127.0.0.1/",
    "https://127.0.0.5/",
    "https://10.0.0.1/",
    "https://10.255.255.255/",
    "https://192.168.1.1/",
    "https://172.16.0.1/",
    "https://172.31.255.255/",
    "https://169.254.169.254/latest/meta-data/", // AWS/GCP metadata
    "https://0.0.0.0/",
    "https://100.64.1.1/", // CGNAT
  ])("rejects %s", (url) => {
    expect(() => assertSafeOutboundUrl(url)).toThrow(UnsafeOutboundUrlError);
  });

  test("accepts public 172.32 (just outside the private range)", () => {
    expect(() => assertSafeOutboundUrl("https://172.32.0.1/")).not.toThrow();
  });

  test("accepts public 100.63 (just outside CGNAT)", () => {
    expect(() => assertSafeOutboundUrl("https://100.63.0.1/")).not.toThrow();
  });
});

describe("assertSafeOutboundUrl — IPv6 private ranges", () => {
  test.each([
    "https://[::1]/",
    "https://[::]/",
    "https://[fc00::1]/", // unique local
    "https://[fd12:3456:789a::1]/",
    "https://[fe80::1]/", // link-local
    "https://[::ffff:127.0.0.1]/", // IPv4-mapped loopback
    "https://[::ffff:10.0.0.1]/", // IPv4-mapped private
  ])("rejects %s", (url) => {
    expect(() => assertSafeOutboundUrl(url)).toThrow(UnsafeOutboundUrlError);
  });

  test("accepts global IPv6", () => {
    // 2001:db8::/32 is documentation prefix; treat as "looks public" for the
    // purpose of this write-time gate. Runtime DNS check is the real guard.
    expect(() => assertSafeOutboundUrl("https://[2001:db8::1]/")).not.toThrow();
  });
});

describe("assertSafeOutboundUrl — hostname pitfalls", () => {
  test("rejects localhost", () => {
    expect(() => assertSafeOutboundUrl("https://localhost/")).toThrow(/loopback/);
  });

  test("rejects *.localhost subdomains", () => {
    expect(() => assertSafeOutboundUrl("https://api.localhost/")).toThrow(/loopback/);
  });

  test("rejects single-label hostnames (search-domain risk)", () => {
    expect(() => assertSafeOutboundUrl("https://metadata/")).toThrow(/single-label/);
    expect(() => assertSafeOutboundUrl("https://kubernetes/")).toThrow(/single-label/);
  });

  test("malformed URL is rejected with a clear reason", () => {
    expect(() => assertSafeOutboundUrl("not a url")).toThrow(/malformed/);
  });

  test("rejects empty string", () => {
    expect(() => assertSafeOutboundUrl("")).toThrow(/malformed/);
  });
});

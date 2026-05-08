/**
 * Tests for apps/web/lib/rate-limit.ts (in-memory path only — no Redis in unit tests)
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Ensure no Redis URL is set so we always hit the in-memory path
beforeEach(() => {
  delete process.env.REDIS_URL;
  // Reset module so the in-memory Map is fresh between tests
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

async function getRateLimit() {
  const mod = await import("../../apps/web/lib/rate-limit");
  return mod;
}

describe("checkRateLimitAsync (in-memory)", () => {
  test("allows requests within limit", async () => {
    const { checkRateLimitAsync } = await getRateLimit();
    for (let i = 0; i < 10; i++) {
      expect(await checkRateLimitAsync("bucket-a", 10, 60_000)).toBe(true);
    }
  });

  test("blocks request that exceeds limit", async () => {
    const { checkRateLimitAsync } = await getRateLimit();
    for (let i = 0; i < 10; i++) {
      await checkRateLimitAsync("bucket-b", 10, 60_000);
    }
    expect(await checkRateLimitAsync("bucket-b", 10, 60_000)).toBe(false);
  });

  test("different buckets do not interfere", async () => {
    const { checkRateLimitAsync } = await getRateLimit();
    for (let i = 0; i < 10; i++) {
      await checkRateLimitAsync("bucket-c", 10, 60_000);
    }
    // bucket-c is exhausted; bucket-d should still be fresh
    expect(await checkRateLimitAsync("bucket-d", 10, 60_000)).toBe(true);
    expect(await checkRateLimitAsync("bucket-c", 10, 60_000)).toBe(false);
  });

  test("window resets after windowMs", async () => {
    vi.useFakeTimers();
    const { checkRateLimitAsync } = await getRateLimit();

    for (let i = 0; i < 5; i++) {
      await checkRateLimitAsync("bucket-e", 5, 1_000);
    }
    expect(await checkRateLimitAsync("bucket-e", 5, 1_000)).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1_001);
    expect(await checkRateLimitAsync("bucket-e", 5, 1_000)).toBe(true);
  });
});

describe("RATE_LIMITS profiles", () => {
  test("default profile allows 30/min", async () => {
    const { checkRateLimitAsync } = await getRateLimit();
    for (let i = 0; i < 30; i++) {
      expect(await checkRateLimitAsync("prof-default", "default")).toBe(true);
    }
    expect(await checkRateLimitAsync("prof-default", "default")).toBe(false);
  });

  test("write profile allows 10/min", async () => {
    const { checkRateLimitAsync } = await getRateLimit();
    for (let i = 0; i < 10; i++) {
      expect(await checkRateLimitAsync("prof-write", "write")).toBe(true);
    }
    expect(await checkRateLimitAsync("prof-write", "write")).toBe(false);
  });

  test("challenge profile allows 20/min", async () => {
    const { checkRateLimitAsync } = await getRateLimit();
    for (let i = 0; i < 20; i++) {
      expect(await checkRateLimitAsync("prof-challenge", "challenge")).toBe(true);
    }
    expect(await checkRateLimitAsync("prof-challenge", "challenge")).toBe(false);
  });

  test("signature profile allows 60/min", async () => {
    const { checkRateLimitAsync } = await getRateLimit();
    for (let i = 0; i < 60; i++) {
      expect(await checkRateLimitAsync("prof-signature", "signature")).toBe(true);
    }
    expect(await checkRateLimitAsync("prof-signature", "signature")).toBe(false);
  });
});

describe("rateLimitBucket", () => {
  test("with pubkey includes IP, pubkey, and scope", async () => {
    const { rateLimitBucket } = await getRateLimit();
    const key = rateLimitBucket("1.2.3.4", "proposals-write", "PUBKEY123");
    expect(key).toBe("1.2.3.4:PUBKEY123:proposals-write");
  });

  test("without pubkey returns IP:scope", async () => {
    const { rateLimitBucket } = await getRateLimit();
    const key = rateLimitBucket("1.2.3.4", "challenge");
    expect(key).toBe("1.2.3.4:challenge");
  });
});

describe("enforceIpAndWalletLimits", () => {
  test("allows traffic until either bucket is exhausted", async () => {
    const { enforceIpAndWalletLimits } = await getRateLimit();
    for (let i = 0; i < 5; i++) {
      expect(
        await enforceIpAndWalletLimits({
          ip: "9.9.9.9",
          pubkey: "PK-A",
          scope: "test-scope",
          ipLimit: 5,
          walletLimit: 5,
        }),
      ).toBe(true);
    }
    expect(
      await enforceIpAndWalletLimits({
        ip: "9.9.9.9",
        pubkey: "PK-A",
        scope: "test-scope",
        ipLimit: 5,
        walletLimit: 5,
      }),
    ).toBe(false);
  });

  test("rotating wallets behind one IP cannot exceed the IP cap", async () => {
    // The whole point of dual-bucketing: an attacker with N wallets behind a
    // single IP must NOT get N × wallet budget. The IP cap should bite first.
    const { enforceIpAndWalletLimits } = await getRateLimit();
    const ip = "8.8.8.8";
    let allowed = 0;
    for (let i = 0; i < 50; i++) {
      const ok = await enforceIpAndWalletLimits({
        ip,
        pubkey: `PK-${i}`,
        scope: "rotation-test",
        ipLimit: 10,
        walletLimit: 100,
      });
      if (ok) allowed++;
    }
    expect(allowed).toBe(10);
  });

  test("a single wallet behind two IPs is still capped by the wallet limit", async () => {
    // The mirror case: one wallet rotating IPs (Tor, mobile network changes)
    // should still hit the wallet cap before unbounded abuse.
    const { enforceIpAndWalletLimits } = await getRateLimit();
    const pubkey = "PK-WALLET-TEST";
    let allowed = 0;
    for (let i = 0; i < 50; i++) {
      const ok = await enforceIpAndWalletLimits({
        ip: `7.7.7.${i}`,
        pubkey,
        scope: "ip-rotation-test",
        ipLimit: 100,
        walletLimit: 8,
      });
      if (ok) allowed++;
    }
    expect(allowed).toBe(8);
  });

  test("IP rejection does not consume wallet budget", async () => {
    // If the IP is saturated, the wallet's bucket should not be touched —
    // otherwise a noisy NAT neighbour drains a real user's budget too.
    const { enforceIpAndWalletLimits } = await getRateLimit();
    const ip = "6.6.6.6";
    const pubkey = "PK-VICTIM";

    // Saturate the IP
    for (let i = 0; i < 5; i++) {
      await enforceIpAndWalletLimits({
        ip,
        pubkey: `PK-NOISE-${i}`,
        scope: "ip-saturation",
        ipLimit: 5,
        walletLimit: 100,
      });
    }
    // Victim hits the saturated IP — should be rejected
    expect(
      await enforceIpAndWalletLimits({
        ip,
        pubkey,
        scope: "ip-saturation",
        ipLimit: 5,
        walletLimit: 100,
      }),
    ).toBe(false);

    // Victim moves to a clean IP — wallet budget should be intact
    let allowedFromCleanIp = 0;
    for (let i = 0; i < 100; i++) {
      const ok = await enforceIpAndWalletLimits({
        ip: "5.5.5.5",
        pubkey,
        scope: "ip-saturation",
        ipLimit: 100,
        walletLimit: 100,
      });
      if (ok) allowedFromCleanIp++;
    }
    expect(allowedFromCleanIp).toBe(100);
  });
});

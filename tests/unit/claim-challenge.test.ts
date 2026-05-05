/**
 * Tests for apps/web/lib/claim-challenge.ts (S4)
 *
 * Tests createChallenge, checkChallenge, and consumeChallenge (Redis consume path).
 * All tests run in-memory (no Redis, no DB).
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

beforeEach(() => {
  process.env.JWT_SIGNING_SECRET = "test-secret-32-chars-long-enough!!";
  delete process.env.REDIS_URL;
  vi.resetModules();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

async function getChallenge() {
  const mod = await import("../../apps/web/lib/claim-challenge");
  return mod;
}

describe("createChallenge / checkChallenge", () => {
  test("valid challenge is accepted", async () => {
    const { createChallenge, checkChallenge } = await getChallenge();
    const { challengeId, challenge } = createChallenge("invoice-123");
    const nonceBytes = checkChallenge("invoice-123", challengeId);
    expect(nonceBytes).not.toBeNull();

    // The returned bytes should equal the decoded challenge nonce
    const padding = "=".repeat((4 - (challenge.length % 4)) % 4);
    const base64 = challenge.replace(/-/g, "+").replace(/_/g, "/") + padding;
    const expected = Buffer.from(base64, "base64");
    expect(Buffer.from(nonceBytes!)).toEqual(expected);
  });

  test("wrong invoiceId returns null", async () => {
    const { createChallenge, checkChallenge } = await getChallenge();
    const { challengeId } = createChallenge("invoice-abc");
    expect(checkChallenge("invoice-xyz", challengeId)).toBeNull();
  });

  test("tampered challengeId (sig part) returns null", async () => {
    const { createChallenge, checkChallenge } = await getChallenge();
    const { challengeId } = createChallenge("invoice-123");
    const tampered = challengeId.slice(0, -4) + "XXXX";
    expect(checkChallenge("invoice-123", tampered)).toBeNull();
  });

  test("tampered challengeId (payload part) returns null", async () => {
    const { createChallenge, checkChallenge } = await getChallenge();
    const { challengeId } = createChallenge("invoice-123");
    // Flip a char near the beginning
    const chars = challengeId.split("");
    chars[2] = chars[2] === "A" ? "B" : "A";
    expect(checkChallenge("invoice-123", chars.join(""))).toBeNull();
  });

  test("expired challenge returns null", async () => {
    vi.useFakeTimers();
    const { createChallenge, checkChallenge } = await getChallenge();
    const { challengeId } = createChallenge("invoice-123");

    // Advance past TTL (60s + 1ms)
    vi.advanceTimersByTime(61_000);
    expect(checkChallenge("invoice-123", challengeId)).toBeNull();
  });

  test("challengeId without dot separator returns null", async () => {
    const { checkChallenge } = await getChallenge();
    expect(checkChallenge("invoice-123", "nodothere")).toBeNull();
  });
});

describe("consumeChallenge (no Redis — no-op)", () => {
  test("returns true when Redis is not configured", async () => {
    const { createChallenge, consumeChallenge } = await getChallenge();
    const { challengeId } = createChallenge("invoice-999");
    const result = await consumeChallenge("invoice-999", challengeId);
    expect(result).toBe(true);
  });

  test("returns true a second time (no-op without Redis)", async () => {
    const { createChallenge, consumeChallenge } = await getChallenge();
    const { challengeId } = createChallenge("invoice-998");
    await consumeChallenge("invoice-998", challengeId);
    const second = await consumeChallenge("invoice-998", challengeId);
    // Without Redis, consume is always true — acceptable dev degradation
    expect(second).toBe(true);
  });
});

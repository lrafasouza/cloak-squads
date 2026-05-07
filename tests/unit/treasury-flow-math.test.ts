import { describe, expect, test } from "vitest";
import {
  DAY_MS,
  bucketize,
  computeWindow,
  ratioBigInt,
  startOfDayUtc,
} from "../../apps/web/lib/treasury-flow-math";

const ms = (s: string) => Date.parse(s);

describe("startOfDayUtc", () => {
  test("rounds any timestamp down to UTC midnight of the same day", () => {
    const noon = ms("2026-05-07T12:34:56.789Z");
    const midnight = ms("2026-05-07T00:00:00.000Z");
    expect(startOfDayUtc(noon)).toBe(midnight);
  });

  test("midnight is its own start of day", () => {
    const midnight = ms("2026-05-07T00:00:00.000Z");
    expect(startOfDayUtc(midnight)).toBe(midnight);
  });

  test("23:59:59.999 maps to the same day's midnight, not the next day's", () => {
    const lateNight = ms("2026-05-07T23:59:59.999Z");
    expect(startOfDayUtc(lateNight)).toBe(ms("2026-05-07T00:00:00.000Z"));
  });
});

describe("computeWindow", () => {
  test("aligns windowStart to UTC midnight regardless of `now` time of day", () => {
    const now = ms("2026-05-07T15:30:00Z");
    const { windowStart } = computeWindow(now, 30);
    // Bucket 0 is start-of-day for now-29days; bucket 29 covers today.
    expect(windowStart).toBe(ms("2026-04-08T00:00:00Z"));
  });

  test("prevStart is exactly windowDays before windowStart", () => {
    const now = ms("2026-05-07T00:00:00Z");
    const { windowStart, prevStart } = computeWindow(now, 30);
    expect(windowStart - prevStart).toBe(30 * DAY_MS);
  });

  test("the window covers `now` (today's events fall into the last bucket)", () => {
    const now = ms("2026-05-07T15:30:00Z");
    const { windowStart } = computeWindow(now, 30);
    const lastBucketStart = windowStart + 29 * DAY_MS;
    const lastBucketEnd = lastBucketStart + DAY_MS;
    expect(now).toBeGreaterThanOrEqual(lastBucketStart);
    expect(now).toBeLessThan(lastBucketEnd);
  });
});

describe("bucketize", () => {
  test("produces exactly windowDays buckets, oldest first", () => {
    const start = ms("2026-04-08T00:00:00Z");
    const buckets = bucketize([], start, 30);
    expect(buckets).toHaveLength(30);
    expect(buckets[0]?.ts).toBe(start);
    expect(buckets[29]?.ts).toBe(start + 29 * DAY_MS);
  });

  test("sums BigInt lamports into the day they land in", () => {
    const start = ms("2026-04-08T00:00:00Z");
    const buckets = bucketize(
      [
        { ts: ms("2026-04-08T05:00:00Z"), lamports: 100n },
        { ts: ms("2026-04-08T15:00:00Z"), lamports: 50n },
        { ts: ms("2026-04-09T01:00:00Z"), lamports: 999n },
      ],
      start,
      30,
    );
    expect(buckets[0]?.lamports).toBe(150n);
    expect(buckets[1]?.lamports).toBe(999n);
    expect(buckets[2]?.lamports).toBe(0n);
  });

  test("drops events outside the window without throwing", () => {
    const start = ms("2026-04-08T00:00:00Z");
    const buckets = bucketize(
      [
        { ts: ms("2026-04-07T23:59:00Z"), lamports: 1n }, // before window
        { ts: ms("2026-05-08T00:00:00Z"), lamports: 1n }, // after window
        { ts: start, lamports: 7n }, // inside window
      ],
      start,
      30,
    );
    const total = buckets.reduce((acc, b) => acc + b.lamports, 0n);
    expect(total).toBe(7n);
  });

  test("places an event exactly at the window boundary in bucket 0", () => {
    const start = ms("2026-04-08T00:00:00Z");
    const buckets = bucketize([{ ts: start, lamports: 42n }], start, 30);
    expect(buckets[0]?.lamports).toBe(42n);
  });

  test("preserves BigInt precision for amounts above Number.MAX_SAFE_INTEGER", () => {
    const start = ms("2026-04-08T00:00:00Z");
    const huge = 9_999_999_999_999_999_999n; // > Number.MAX_SAFE_INTEGER
    const buckets = bucketize([{ ts: start, lamports: huge }], start, 1);
    expect(buckets[0]?.lamports).toBe(huge);
  });
});

describe("ratioBigInt", () => {
  test("returns null when denominator is zero", () => {
    expect(ratioBigInt(100n, 0n)).toBeNull();
  });

  test("returns null when denominator is negative", () => {
    expect(ratioBigInt(100n, -10n)).toBeNull();
  });

  test("computes simple ratio for small values", () => {
    expect(ratioBigInt(50n, 100n)).toBeCloseTo(0.5, 6);
    expect(ratioBigInt(1n, 4n)).toBeCloseTo(0.25, 6);
  });

  test("preserves precision for values above Number.MAX_SAFE_INTEGER", () => {
    // 73.4% of 10^18 lamports, both values exceed Number precision range.
    const denom = 1_000_000_000_000_000_000n;
    const numer = 734_000_000_000_000_000n;
    const ratio = ratioBigInt(numer, denom);
    expect(ratio).not.toBeNull();
    expect(ratio).toBeCloseTo(0.734, 5);
  });

  test("handles negative numerator (decline)", () => {
    // Outflow shrunk from 200 to 100: delta = -100, ratio = -0.5
    expect(ratioBigInt(-100n, 200n)).toBeCloseTo(-0.5, 6);
  });

  test("zero numerator yields zero", () => {
    expect(ratioBigInt(0n, 100n)).toBe(0);
  });

  test("ratio above 100% (growth) preserved", () => {
    // 10x growth, ratio = 10
    expect(ratioBigInt(10_000n, 1_000n)).toBeCloseTo(10, 6);
  });
});

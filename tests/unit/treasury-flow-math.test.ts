import { describe, expect, test } from "vitest";
import {
  DAY_MS,
  type IncomeRecord,
  type ProposalRecord,
  aggregateTreasuryFlow,
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

// ── aggregateTreasuryFlow ──────────────────────────────────────────────────
//
// These tests guard the single most user-visible KPI on the dashboard. The
// regression they protect against: moving SOL between sub-vaults inflated the
// 30-day inflow because sub-vault PDAs are also vaults the indexer watches,
// and any post > pre lamport diff was treated as new income. The fix is the
// `internalAddresses` filter — every test below sets `now` to a fixed point
// inside the window so behavior is deterministic.

const NOW = Date.parse("2026-05-07T12:00:00Z");
const TODAY_S = Math.floor(NOW / 1000);
const PRIMARY = "PrimaryVaultPdaBase58";
const SUB_PAYROLL = "SubVaultPayrollPdaBase58";
const SUB_OPS = "SubVaultOpsPdaBase58";
const EXTERNAL_WALLET = "ExternalWalletBase58";

function income(partial: Partial<IncomeRecord> & { lamports: bigint; from: string }): IncomeRecord {
  return {
    amountLamports: partial.lamports.toString(),
    from: partial.from,
    blockTime: partial.blockTime ?? TODAY_S,
  };
}

function proposal(partial: Partial<ProposalRecord> = {}): ProposalRecord {
  return {
    type: "single",
    hasDraft: false,
    status: "executed",
    createdAt: new Date(NOW).toISOString(),
    ...partial,
  };
}

describe("aggregateTreasuryFlow — internal-address filter", () => {
  test("excludes inflow when source is one of our own vaults", () => {
    const internal = new Set([PRIMARY, SUB_PAYROLL, SUB_OPS]);
    const out = aggregateTreasuryFlow({
      income: [
        income({ lamports: 500_000_000n, from: EXTERNAL_WALLET }), // 0.5 SOL external
        income({ lamports: 200_000_000n, from: PRIMARY }), // 0.2 SOL primary → sub
        income({ lamports: 100_000_000n, from: SUB_PAYROLL }), // 0.1 SOL sub → sub
      ],
      proposals: [],
      now: NOW,
      windowDays: 30,
      internalAddresses: internal,
    });
    // Only the external 0.5 SOL counts.
    expect(out.inflowLamports).toBe(500_000_000n);
  });

  test("counts inflow normally when no filter is provided (legacy callers)", () => {
    const out = aggregateTreasuryFlow({
      income: [
        income({ lamports: 500_000_000n, from: EXTERNAL_WALLET }),
        income({ lamports: 200_000_000n, from: PRIMARY }),
      ],
      proposals: [],
      now: NOW,
      windowDays: 30,
    });
    expect(out.inflowLamports).toBe(700_000_000n);
  });

  test("excludes outflow when single-send recipient is one of our own vaults", () => {
    const internal = new Set([PRIMARY, SUB_PAYROLL]);
    const out = aggregateTreasuryFlow({
      income: [],
      proposals: [
        proposal({ type: "single", amount: "300000000", recipient: EXTERNAL_WALLET }),
        proposal({ type: "single", amount: "200000000", recipient: SUB_PAYROLL }),
      ],
      now: NOW,
      windowDays: 30,
      internalAddresses: internal,
    });
    // Only the external transfer (0.3 SOL) counts.
    expect(out.outflowLamports).toBe(300_000_000n);
  });

  test("payroll proposals are not filtered by recipient (label, not an address)", () => {
    const internal = new Set([PRIMARY, SUB_PAYROLL]);
    const out = aggregateTreasuryFlow({
      income: [],
      proposals: [
        proposal({
          type: "payroll",
          totalAmount: "1000000000",
          recipient: "5 recipients", // label, never matches a base58 PDA
          hasDraft: true,
        }),
      ],
      now: NOW,
      windowDays: 30,
      internalAddresses: internal,
    });
    expect(out.outflowLamports).toBe(1_000_000_000n);
    expect(out.privateOutflowLamports).toBe(1_000_000_000n);
  });

  test("symmetric prior-window filter — delta isn't poisoned by old internal moves", () => {
    const internal = new Set([PRIMARY, SUB_PAYROLL]);
    const prevWindowDay = Math.floor((NOW - 35 * DAY_MS) / 1000); // ~35d ago
    const out = aggregateTreasuryFlow({
      income: [
        // current window: 1 SOL legitimately external
        income({ lamports: 1_000_000_000n, from: EXTERNAL_WALLET }),
        // prior window: 10 SOL but it was an internal shuffle — must not
        // appear as a "10 SOL drop" in the delta.
        income({ lamports: 10_000_000_000n, from: PRIMARY, blockTime: prevWindowDay }),
      ],
      proposals: [],
      now: NOW,
      windowDays: 30,
      internalAddresses: internal,
    });
    expect(out.inflowLamports).toBe(1_000_000_000n);
    // prevInflow = 0 (filtered) → ratioBigInt(_, 0) === null
    expect(out.inflowDelta).toBeNull();
  });

  test("privacy share recomputed after internal proposal filter", () => {
    const internal = new Set([SUB_OPS]);
    const out = aggregateTreasuryFlow({
      income: [],
      proposals: [
        // public external send: 1 SOL (counts)
        proposal({
          type: "single",
          kind: "public",
          hasDraft: true,
          amount: "1000000000",
          recipient: EXTERNAL_WALLET,
        }),
        // public internal shuffle: 5 SOL (must NOT count)
        proposal({
          type: "single",
          kind: "public",
          hasDraft: true,
          amount: "5000000000",
          recipient: SUB_OPS,
        }),
        // private external send: 1 SOL (counts as private)
        proposal({
          type: "single",
          kind: "private",
          hasDraft: true,
          amount: "1000000000",
          recipient: EXTERNAL_WALLET,
        }),
      ],
      now: NOW,
      windowDays: 30,
      internalAddresses: internal,
    });
    expect(out.outflowLamports).toBe(2_000_000_000n);
    expect(out.privateOutflowLamports).toBe(1_000_000_000n);
    expect(out.publicOutflowLamports).toBe(1_000_000_000n);
    expect(out.privacyShare).toBeCloseTo(0.5, 6);
    expect(out.privateCount).toBe(1);
    expect(out.publicCount).toBe(1);
  });

  test("malformed amountLamports doesn't crash aggregation", () => {
    const out = aggregateTreasuryFlow({
      income: [
        income({ lamports: 500_000_000n, from: EXTERNAL_WALLET }),
        // craft a bad row by hand — BigInt() throws on this
        { amountLamports: "not-a-number", from: EXTERNAL_WALLET, blockTime: TODAY_S },
      ],
      proposals: [],
      now: NOW,
      windowDays: 30,
    });
    expect(out.inflowLamports).toBe(500_000_000n);
  });
});

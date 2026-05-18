/**
 * Pure aggregation helpers for the treasury flow KPI hook. Extracted into a
 * dependency-free module so they can be unit-tested without spinning up
 * React, the Solana RPC, or any database.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type FlowEvent = {
  /** Event timestamp in milliseconds since epoch. */
  ts: number;
  lamports: bigint;
};

export type FlowBucket = {
  /** Bucket start (UTC midnight) in ms. */
  ts: number;
  lamports: bigint;
};

/** Round a timestamp down to UTC midnight. */
export function startOfDayUtc(ts: number): number {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Compute the rolling window the treasury flow hook uses. Aligned to UTC
 * calendar days so the sparkline buckets and the include/exclude filter use
 * the same boundaries (otherwise an event that just happened today can be
 * inside the filter range but outside the last bucket).
 *
 * The returned `windowStart` is the start of bucket 0; the last bucket
 * (`windowDays - 1`) covers up to `now`.
 */
export function computeWindow(
  now: number,
  windowDays: number,
): {
  windowStart: number;
  prevStart: number;
} {
  const windowStart = startOfDayUtc(now) - (windowDays - 1) * DAY_MS;
  const prevStart = windowStart - windowDays * DAY_MS;
  return { windowStart, prevStart };
}

const RATIO_SCALE = 1_000_000n;

/**
 * Compute `numerator / denominator` as a Number ratio without losing precision
 * when the inputs exceed Number.MAX_SAFE_INTEGER. Returns null when the
 * denominator is non-positive (callers ratio non-negative monetary totals,
 * the guard makes the contract explicit).
 *
 * Implementation scales the numerator into ppm space inside BigInt, then
 * drops to Number for the final divide. The scaled quotient always fits
 * comfortably in a Number for any realistic treasury ratio (<= 10000% would
 * be 1e8 ppm, well below 2^53).
 */
export function ratioBigInt(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) return null;
  const scaled = (numerator * RATIO_SCALE) / denominator;
  return Number(scaled) / Number(RATIO_SCALE);
}

/**
 * Distribute events into per-day buckets. Events whose `ts` falls outside
 * `[startTs, startTs + windowDays * DAY_MS)` are silently dropped, so callers
 * are responsible for filtering before bucketizing if they want hard
 * accounting.
 */
export function bucketize(events: FlowEvent[], startTs: number, windowDays: number): FlowBucket[] {
  const start = startOfDayUtc(startTs);
  const buckets: FlowBucket[] = Array.from({ length: windowDays }, (_, i) => ({
    ts: start + i * DAY_MS,
    lamports: 0n,
  }));
  for (const ev of events) {
    const dayStart = startOfDayUtc(ev.ts);
    const idx = Math.floor((dayStart - start) / DAY_MS);
    if (idx >= 0 && idx < windowDays) {
      const bucket = buckets[idx];
      if (bucket) bucket.lamports += ev.lamports;
    }
  }
  return buckets;
}

// ── Treasury flow aggregation ──────────────────────────────────────────────
//
// `useTreasuryFlow` reduces a stream of income rows + proposal summaries into
// the KPI shape rendered by `TreasuryFlowStrip`. The reduction itself is pure
// (input → output), so it lives here so unit tests can exercise it without a
// React renderer and without mocking React Query.

export type IncomeRecord = {
  /** Stringified lamports — BigInt over the wire to survive JSON. */
  amountLamports: string;
  /** Sender address, base58. May be "Unknown" for old rows pre-parser-fix. */
  from: string;
  /** Unix-seconds (matches the API contract; we multiply by 1000 here). */
  blockTime: number;
};

export type ProposalRecord = {
  createdAt?: string;
  amount?: string;
  totalAmount?: string;
  recipient?: string;
  status?: string;
  type: "single" | "payroll" | "swap" | "onchain";
  hasDraft: boolean;
  kind?: "private" | "public";
};

export type AggregatedFlow = {
  inflowLamports: bigint;
  outflowLamports: bigint;
  privateOutflowLamports: bigint;
  publicOutflowLamports: bigint;
  privateCount: number;
  publicCount: number;
  privacyShare: number | null;
  inflowDelta: number | null;
  outflowDelta: number | null;
  inflowSpark: FlowBucket[];
  outflowSpark: FlowBucket[];
};

/**
 * Pure aggregation. See `useTreasuryFlow` for the React wrapper.
 *
 * `internalAddresses` is the set of base58 PDAs the multisig owns (primary
 * vault + every sub-vault). Any income whose `from` is in the set is treated
 * as an intra-treasury shuffle and excluded from inflow (current AND prior
 * windows so the delta stays symmetric). Same logic applies to outflow with
 * `recipient` for `single` sends — payroll/swap/onchain proposals don't carry
 * an address-shaped recipient and so can't be internal by construction.
 */
export function aggregateTreasuryFlow({
  income,
  proposals,
  now,
  windowDays,
  internalAddresses,
}: {
  income: IncomeRecord[];
  proposals: ProposalRecord[];
  now: number;
  windowDays: number;
  internalAddresses?: ReadonlySet<string> | undefined;
}): AggregatedFlow {
  const internal = internalAddresses;
  const { windowStart, prevStart } = computeWindow(now, windowDays);
  const sparkStart = windowStart;

  let inflow = 0n;
  let prevInflow = 0n;
  const inflowEvents: FlowEvent[] = [];
  for (const inc of income) {
    if (internal?.has(inc.from)) continue;

    const ts = inc.blockTime * 1000;
    let lamports: bigint;
    try {
      lamports = BigInt(inc.amountLamports);
    } catch {
      continue;
    }
    if (ts >= windowStart && ts <= now) {
      inflow += lamports;
      inflowEvents.push({ ts, lamports });
    } else if (ts >= prevStart && ts < windowStart) {
      prevInflow += lamports;
    }
  }

  let outflow = 0n;
  let prevOutflow = 0n;
  let privateOutflow = 0n;
  let publicOutflow = 0n;
  let privateCount = 0;
  let publicCount = 0;
  const outflowEvents: FlowEvent[] = [];

  for (const p of proposals) {
    const ts = p.createdAt ? new Date(p.createdAt).getTime() : 0;
    if (!ts) continue;
    if (p.status !== "executed") continue;

    // Payroll proposals carry totalAmount; single proposals carry amount.
    const raw = p.totalAmount ?? p.amount;
    let lamports: bigint;
    try {
      lamports = raw ? BigInt(raw) : 0n;
    } catch {
      lamports = 0n;
    }
    if (lamports <= 0n) continue;

    if (
      internal &&
      p.type === "single" &&
      typeof p.recipient === "string" &&
      internal.has(p.recipient)
    ) {
      continue;
    }

    if (ts >= windowStart && ts <= now) {
      outflow += lamports;
      outflowEvents.push({ ts, lamports });
      // Privacy split: a flow is private when it carries a Cloak draft AND
      // wasn't tagged as a public-kind transfer.
      const isPrivate = p.hasDraft && p.kind !== "public";
      if (isPrivate) {
        privateOutflow += lamports;
        privateCount += 1;
      } else {
        publicOutflow += lamports;
        publicCount += 1;
      }
    } else if (ts >= prevStart && ts < windowStart) {
      prevOutflow += lamports;
    }
  }

  return {
    inflowLamports: inflow,
    outflowLamports: outflow,
    privateOutflowLamports: privateOutflow,
    publicOutflowLamports: publicOutflow,
    privateCount,
    publicCount,
    privacyShare: ratioBigInt(privateOutflow, outflow),
    inflowDelta: ratioBigInt(inflow - prevInflow, prevInflow),
    outflowDelta: ratioBigInt(outflow - prevOutflow, prevOutflow),
    inflowSpark: bucketize(inflowEvents, sparkStart, windowDays),
    outflowSpark: bucketize(outflowEvents, sparkStart, windowDays),
  };
}

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

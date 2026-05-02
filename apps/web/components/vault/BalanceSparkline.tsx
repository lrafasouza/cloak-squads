"use client";

import type { BalanceHistoryPoint } from "@/lib/hooks/useBalanceHistory";

export function BalanceSparkline({ points }: { points: BalanceHistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-surface-2 px-4 text-center text-xs text-ink-subtle">
        Balance history will show up after more snapshots are collected.
      </div>
    );
  }

  const min = Math.min(...points.map((point) => point.balanceLamports));
  const max = Math.max(...points.map((point) => point.balanceLamports));
  const spread = Math.max(1, max - min);
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 90 - ((point.balanceLamports - min) / spread) * 80;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="h-24 rounded-lg border border-border bg-surface-2 p-3">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Balance history">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" className="text-accent" />
      </svg>
    </div>
  );
}

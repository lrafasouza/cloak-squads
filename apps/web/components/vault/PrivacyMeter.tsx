"use client";

import { cn } from "@/lib/utils";
import { Shield, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

type PoolStats = {
  mint: string;
  anonymitySetTotal: number;
  poolDepthLamports: string;
  riskScore: "low" | "medium" | "high";
  updatedAt: number;
  cached: boolean;
};

const RISK_CONFIG = {
  low: {
    label: "Low risk",
    color: "text-signal-success",
    bg: "bg-signal-success/10",
    bar: "bg-signal-success",
    icon: Shield,
  },
  medium: {
    label: "Medium risk",
    color: "text-signal-warning",
    bg: "bg-signal-warning/10",
    bar: "bg-signal-warning",
    icon: Shield,
  },
  high: {
    label: "High risk",
    color: "text-signal-error",
    bg: "bg-signal-error/10",
    bar: "bg-signal-error",
    icon: ShieldAlert,
  },
};

function lamportsToSolDisplay(lamportsStr: string): string {
  const n = BigInt(lamportsStr);
  const sol = Number(n) / 1e9;
  return sol.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function PrivacyMeter({ mint }: { mint?: string }) {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = `/api/cloak/pool-stats${mint ? `?mint=${encodeURIComponent(mint)}` : ""}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PoolStats | null) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [mint]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
        <div className="h-3 w-3 animate-pulse rounded-full bg-border" />
        <span className="text-xs text-ink-subtle">Loading privacy stats…</span>
      </div>
    );
  }

  if (!stats) return null;

  const cfg = RISK_CONFIG[stats.riskScore];
  const Icon = cfg.icon;
  const barWidth = Math.min(100, (stats.anonymitySetTotal / 1000) * 100);

  return (
    <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
          <span className="text-xs font-semibold text-ink">Privacy meter</span>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.bg, cfg.color)}>
          {cfg.label}
        </span>
      </div>

      {/* Anonymity set bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-ink-subtle">
          <span>Anonymity set</span>
          <span className="font-semibold text-ink">
            {stats.anonymitySetTotal.toLocaleString()} deposits
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className={cn("h-full rounded-full transition-all", cfg.bar)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      {/* Pool depth */}
      <p className="text-[10px] text-ink-subtle">
        Pool depth:{" "}
        <span className="font-medium text-ink">
          {lamportsToSolDisplay(stats.poolDepthLamports)} SOL shielded
        </span>
      </p>

      {/* Threat model honesty */}
      <p className="rounded-md bg-surface-2 px-2.5 py-2 text-[10px] leading-relaxed text-ink-subtle">
        Operator hop is public — observers see vault → operator → Cloak pool.
        The privacy guarantee is that no observer can prove which withdrawal
        corresponds to your deposit, because the pool has{" "}
        {stats.anonymitySetTotal.toLocaleString()} other deposits to choose from.
      </p>
    </div>
  );
}

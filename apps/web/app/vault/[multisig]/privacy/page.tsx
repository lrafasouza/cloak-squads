"use client";

import {
  Panel,
  PanelBody,
  PanelHeader,
  ProgressBar,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { cn } from "@/lib/utils";
import {
  Eye,
  EyeOff,
  Lock,
  Shield,
  ShieldAlert,
  Shuffle,
} from "lucide-react";
import { use, useEffect, useState } from "react";

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
    color: "text-signal-positive",
    bg: "bg-signal-positive/10",
    border: "border-signal-positive/20",
    bar: "bg-signal-positive",
    icon: Shield,
    tip: "Strong anonymity. The pool has enough deposits to make tracing very difficult.",
  },
  medium: {
    label: "Medium risk",
    color: "text-signal-warn",
    bg: "bg-signal-warn/10",
    border: "border-signal-warn/20",
    bar: "bg-signal-warn",
    icon: Shield,
    tip: "Moderate anonymity. Consider waiting for more deposits before transacting.",
  },
  high: {
    label: "High risk",
    color: "text-signal-danger",
    bg: "bg-signal-danger/10",
    border: "border-signal-danger/20",
    bar: "bg-signal-danger",
    icon: ShieldAlert,
    tip: "Low anonymity. High correlation risk. Wait until the pool grows larger.",
  },
};

function lamportsToSol(raw: string): string {
  try {
    return (Number(BigInt(raw)) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 2 });
  } catch {
    return "–";
  }
}

function relativeTime(ms: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ms).toLocaleDateString();
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "warn" | "danger";
}) {
  const valueColor = {
    neutral: "text-ink",
    positive: "text-signal-positive",
    warn: "text-signal-warn",
    danger: "text-signal-danger",
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
        {label}
      </p>
      <p className={cn("mt-1.5 font-display text-2xl font-semibold tabular-nums", valueColor)}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

const FLOW_STEPS = [
  {
    label: "Your vault",
    sub: "Squads multisig",
    icon: Lock,
    public: true,
  },
  {
    label: "Operator",
    sub: "Signs Cloak txs",
    icon: Eye,
    public: true,
  },
  {
    label: "Cloak pool",
    sub: "Funds mixed",
    icon: Shuffle,
    public: false,
  },
  {
    label: "Recipient",
    sub: "Unlinkable",
    icon: EyeOff,
    public: false,
  },
] as const;

export default function PrivacyPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  use(params);

  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/cloak/pool-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PoolStats | null) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const cfg = stats ? RISK_CONFIG[stats.riskScore] : null;
  const RiskIcon = cfg?.icon ?? Shield;
  const barWidth = stats ? Math.min(100, (stats.anonymitySetTotal / 1000) * 100) : 0;

  const statTone = (score: PoolStats["riskScore"] | undefined) => {
    if (!score) return "neutral" as const;
    return score === "low"
      ? ("positive" as const)
      : score === "high"
        ? ("danger" as const)
        : ("warn" as const);
  };

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Privacy"
        title="Privacy Dashboard"
        description="Monitor anonymity pool health and understand how Aegis routes private transfers."
      />

      <div className="space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Anonymity set"
            value={loading ? "…" : stats ? stats.anonymitySetTotal.toLocaleString() : "–"}
            sub="deposits in pool"
            tone={statTone(stats?.riskScore)}
          />
          <StatCard
            label="Pool depth"
            value={
              loading ? "…" : stats ? `${lamportsToSol(stats.poolDepthLamports)} SOL` : "–"
            }
            sub="shielded in Cloak"
          />
          <StatCard
            label="Risk level"
            value={loading ? "…" : cfg ? cfg.label : "–"}
            {...(stats ? { sub: `Updated ${relativeTime(stats.updatedAt)}` } : {})}
            tone={statTone(stats?.riskScore)}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left: flow + explanation */}
          <div className="space-y-4">
            <Panel>
              <PanelHeader
                icon={Shuffle}
                title="How Aegis routes transfers"
                description="Three hops from vault to recipient — only the last two are private."
              />
              <PanelBody className="space-y-5">
                {/* Flow steps */}
                <div className="space-y-3">
                  {FLOW_STEPS.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.label} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                              step.public
                                ? "border-signal-warn/20 bg-signal-warn/10 text-signal-warn"
                                : "border-accent/20 bg-accent/10 text-accent",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          {i < FLOW_STEPS.length - 1 && (
                            <div className="mt-1 h-4 w-px bg-border" />
                          )}
                        </div>
                        <div className="pt-1.5">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-ink">{step.label}</p>
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                                step.public
                                  ? "bg-signal-warn/10 text-signal-warn"
                                  : "bg-accent/10 text-accent",
                              )}
                            >
                              {step.public ? "Visible" : "Private"}
                            </span>
                          </div>
                          <p className="text-xs text-ink-muted">{step.sub}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation callouts */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="rounded-lg border border-signal-warn/20 bg-signal-warn/5 px-4 py-3">
                    <p className="text-xs font-semibold text-signal-warn">Vault → Operator is public</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Anyone can see your vault funding the operator wallet. This hop is on the
                      public Solana ledger and cannot be hidden.
                    </p>
                  </div>
                  <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
                    <p className="text-xs font-semibold text-accent">Pool → Recipient is private</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Once funds enter Cloak, they're indistinguishable from all other deposits.
                      No observer can link your deposit to the withdrawal.
                    </p>
                  </div>
                </div>
              </PanelBody>
            </Panel>
          </div>

          {/* Right: anonymity meter + tips (sticky) */}
          <div className="lg:sticky lg:top-6 lg:self-start space-y-3">
            <Panel>
              <PanelHeader
                icon={RiskIcon}
                title="Anonymity meter"
                description="Pool fill relative to 1,000-deposit target."
              />
              <PanelBody className="space-y-4">
                {loading ? (
                  <p className="animate-pulse text-xs text-ink-subtle">Loading stats…</p>
                ) : !stats ? (
                  <p className="text-xs text-ink-subtle">Could not load pool stats.</p>
                ) : (
                  <>
                    <div className="text-center py-2">
                      <p
                        className={cn(
                          "font-display text-5xl font-bold tabular-nums",
                          cfg?.color,
                        )}
                      >
                        {stats.anonymitySetTotal.toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">deposits in pool</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-ink-subtle">Pool fill</span>
                        <span className="font-semibold text-ink">
                          {Math.round(barWidth)}% of 1,000 target
                        </span>
                      </div>
                      <ProgressBar value={barWidth} max={100} />
                    </div>

                    <div
                      className={cn(
                        "rounded-lg border px-4 py-3 space-y-1",
                        cfg?.border,
                        cfg?.bg,
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <RiskIcon className={cn("h-3.5 w-3.5", cfg?.color)} />
                        <p className={cn("text-xs font-semibold", cfg?.color)}>{cfg?.label}</p>
                      </div>
                      <p className="text-xs text-ink-muted">{cfg?.tip}</p>
                    </div>
                  </>
                )}
              </PanelBody>
            </Panel>

            <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-ink">Tips for better privacy</p>
              <ul className="space-y-1.5 text-[11px] text-ink-muted">
                <li>• Wait for anonymity set &gt; 1,000 before sending</li>
                <li>• Use round amounts to blend with other deposits</li>
                <li>• Avoid sending at the same time as your deposit</li>
                <li>• Don't reuse recipient addresses</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </WorkspacePage>
  );
}

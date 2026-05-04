"use client";

import { WarningCallout } from "@/components/ui/warning-callout";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import NumberFlow from "@number-flow/react";
import { RefreshCw, TrendingUp } from "lucide-react";

interface OverviewCardProps {
  multisig: string;
  balanceSol: string;
  usdcUi: string;
  cofreInitialized: boolean;
  onRefresh: () => void;
}

export function OverviewCard({
  balanceSol,
  usdcUi,
  cofreInitialized,
  onRefresh,
}: OverviewCardProps) {
  const { data: solPrice } = useSolPrice();

  const solNum = parseFloat(balanceSol) || 0;
  const usdcNum = parseFloat(usdcUi) || 0;

  const solUsd = solPrice != null ? solNum * solPrice : null;
  const totalUsd = solUsd != null ? solUsd + usdcNum : null;

  const totalUsdFormatted =
    totalUsd != null
      ? totalUsd.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        })
      : null;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-raise-1 transition-all duration-300 hover:border-accent/20 hover:shadow-accent-glow">
      {/* Golden accent top bar */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/[0.04] blur-3xl" />

      <div className="relative p-6 md:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
              <TrendingUp className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle">
              Total Balance
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
            aria-label="Refresh balance"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Primary: total USD */}
        <div className="mt-4 flex items-baseline gap-2">
          {totalUsdFormatted != null ? (
            <NumberFlow
              value={totalUsd!}
              className="font-display text-2xl font-bold tabular-nums tracking-tight text-ink md:text-3xl"
              prefix="$"
              locales="en-US"
              format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
              transformTiming={{ duration: 400, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          ) : (
            <span className="font-display text-2xl font-bold tabular-nums tracking-tight text-ink md:text-3xl">
              —
            </span>
          )}
        </div>

        {/* Secondary: SOL + USDC breakdown */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono text-sm tabular-nums text-ink-muted">
            <span className="text-ink-subtle">{balanceSol}</span>
            {" "}
            <span className="text-ink-subtle/60">SOL</span>
          </span>
          <span className="text-ink-subtle/30">·</span>
          <span className="font-mono text-sm tabular-nums text-ink-muted">
            <span className="text-ink-subtle">{usdcNum > 0 ? usdcUi : "0"}</span>
            {" "}
            <span className="text-ink-subtle/60">USDC</span>
          </span>
        </div>
      </div>

      {!cofreInitialized && (
        <div className="border-t border-border/50 px-6 py-4 md:px-8">
          <WarningCallout variant="warning" className="text-xs">
            Private transactions are not active yet. Set up your vault's privacy layer to enable shielded sends.
          </WarningCallout>
        </div>
      )}
    </div>
  );
}

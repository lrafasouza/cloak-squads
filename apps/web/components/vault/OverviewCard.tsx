"use client";

import { WarningCallout } from "@/components/ui/warning-callout";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import NumberFlow from "@number-flow/react";
import { RefreshCw, TrendingUp } from "lucide-react";

interface OverviewCardProps {
  multisig: string;
  balanceSol: string;
  cofreInitialized: boolean;
  onRefresh: () => void;
}

export function OverviewCard({
  balanceSol,
  cofreInitialized,
  onRefresh,
}: OverviewCardProps) {
  const { data: solPrice } = useSolPrice();
  const balanceNum = parseFloat(balanceSol) || 0;

  const usdValue =
    solPrice != null
      ? (balanceNum * solPrice).toLocaleString("en-US", {
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

        <div className="mt-4 flex items-baseline gap-2">
          <NumberFlow
            value={balanceNum}
            className="font-display text-2xl font-bold tabular-nums tracking-tight text-ink md:text-3xl"
            suffix=" SOL"
            locales="en-US"
            format={{ minimumFractionDigits: 0, maximumFractionDigits: 9 }}
            transformTiming={{ duration: 400, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </div>

        {usdValue != null && (
          <p className="mt-1 text-sm font-medium tabular-nums text-ink-subtle">{usdValue}</p>
        )}
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

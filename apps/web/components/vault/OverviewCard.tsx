"use client";

import { TokenLogo } from "@/components/ui/token-logo";
import { WarningCallout } from "@/components/ui/warning-callout";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import NumberFlow from "@number-flow/react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ChevronDown,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

function formatBalance(value: string, maxDecimals: number): string {
  const num = Number.parseFloat(value);
  if (Number.isNaN(num)) return "0";
  if (num === 0) return "0";
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
  return formatted;
}

interface OverviewCardProps {
  multisig: string;
  balanceSol: string;
  usdcUi: string;
  cofreInitialized: boolean;
  onRefresh: () => void;
  onReceive: () => void;
  onSend: () => void;
  onSwap: () => void;
}

export function OverviewCard({
  balanceSol,
  usdcUi,
  cofreInitialized,
  onRefresh,
  onReceive,
  onSend,
  onSwap,
}: OverviewCardProps) {
  const { data: solPrice } = useSolPrice();
  const [showBreakdown, setShowBreakdown] = useState(false);

  const solNum = Number.parseFloat(balanceSol) || 0;
  const usdcNum = Number.parseFloat(usdcUi) || 0;

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
        <div className="mt-4">
          {totalUsdFormatted != null ? (
            <NumberFlow
              value={totalUsd ?? 0}
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

          {/* Toggle breakdown */}
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-ink-subtle/40 transition-colors hover:text-ink-subtle/70"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showBreakdown ? "rotate-180" : ""}`}
            />
            {showBreakdown ? "Hide" : "Details"}
          </button>

          {/* Inline breakdown — animated */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${showBreakdown ? "mt-3 grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="overflow-hidden">
              <div className="space-y-1.5 rounded-xl bg-surface-2/40 p-3">
                {/* SOL */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TokenLogo symbol="SOL" size={16} />
                    <span className="text-sm text-ink">SOL</span>
                  </div>
                  <div className="text-right">
                    <span className="block font-mono text-sm font-medium tabular-nums text-ink">
                      {formatBalance(balanceSol, 6)}
                    </span>
                    {solUsd != null && (
                      <span className="text-[11px] text-ink-subtle/50">
                        ≈ ${solUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
                {/* Divider */}
                <div className="h-px bg-border/40" />
                {/* USDC */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TokenLogo symbol="USDC" size={16} />
                    <span className="text-sm text-ink">USDC</span>
                  </div>
                  <div className="text-right">
                    <span className="block font-mono text-sm font-medium tabular-nums text-ink">
                      {formatBalance(usdcUi, 2)}
                    </span>
                    {usdcNum > 0 && (
                      <span className="text-[11px] text-ink-subtle/50">
                        = ${usdcNum.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onReceive}
            className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface-2 px-3 py-2.5 text-sm font-medium text-ink transition-all hover:border-accent/20 hover:text-accent"
          >
            <ArrowDownToLine className="h-4 w-4" strokeWidth={1.5} />
            Deposit
          </button>
          <button
            type="button"
            onClick={onSend}
            className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface-2 px-3 py-2.5 text-sm font-medium text-ink transition-all hover:border-accent/20 hover:text-accent"
          >
            <ArrowUpFromLine className="h-4 w-4" strokeWidth={1.5} />
            Send
          </button>
          <button
            type="button"
            onClick={onSwap}
            className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface-2 px-3 py-2.5 text-sm font-medium text-ink transition-all hover:border-accent/20 hover:text-accent"
          >
            <ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} />
            Swap
          </button>
        </div>
      </div>

      {!cofreInitialized && (
        <div className="border-t border-border/50 px-6 py-4 md:px-8">
          <WarningCallout variant="warning" className="text-xs">
            Private transactions are not active yet. Set up your vault's privacy layer to enable
            shielded sends.
          </WarningCallout>
        </div>
      )}
    </div>
  );
}

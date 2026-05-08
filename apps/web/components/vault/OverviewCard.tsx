"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenLogo } from "@/components/ui/token-logo";
import { WarningCallout } from "@/components/ui/warning-callout";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import type { SubVaultBalance } from "@/lib/use-vault-data";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { ArrowDownToLine, ArrowLeftRight, ChevronDown, Lock, RefreshCw } from "lucide-react";
import { useState } from "react";

interface OverviewCardProps {
  multisig: string;
  balanceSol: string;
  primaryBalanceSol: string;
  usdcUi: string;
  subVaultBreakdown: SubVaultBalance[];
  cofreInitialized: boolean;
  onRefresh: () => void;
  onReceive: () => void;
  onSend: () => void;
  onSwap: () => void;
}

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatSol(value: string, decimals = 4) {
  const n = Number.parseFloat(value) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/**
 * Treasury Hero card.
 *
 * The dashboard's anchor element. One per page, never duplicated, never
 * reactive on hover. Compose the heraldic identity (Æ watermark, Fraunces
 * serif balance, ledger SOL/USDC line) on the left and a vertical actions
 * stack on the right that elevates "Send Private" as the differentiated
 * primary action.
 */
export function OverviewCard({
  balanceSol,
  primaryBalanceSol,
  usdcUi,
  subVaultBreakdown,
  cofreInitialized,
  onRefresh,
  onReceive,
  onSend,
  onSwap,
}: OverviewCardProps) {
  const { data: solPrice, isLoading: solPriceLoading } = useSolPrice();
  const [showBreakdown, setShowBreakdown] = useState(false);

  const solTotal = Number.parseFloat(balanceSol) || 0;
  const usdcTotal = Number.parseFloat(usdcUi) || 0;
  const solUsd = solPrice != null ? solTotal * solPrice : null;
  const totalUsd = solUsd != null ? solUsd + usdcTotal : null;
  // Distinguish "price is in flight" (render skeleton, avoid flashing the
  // SOL-only fallback) from "price API returned null" (keep the SOL fallback
  // as a graceful permanent state).
  const totalUsdPending = solPriceLoading && solPrice === undefined;

  const primarySol = Number.parseFloat(primaryBalanceSol) || 0;
  const subUsdcTotal = subVaultBreakdown.reduce(
    (acc, sv) => acc + (Number.parseFloat(sv.usdcUi) || 0),
    0,
  );
  const primaryUsdc = Math.max(0, usdcTotal - subUsdcTotal);

  const hasSubVaults = subVaultBreakdown.length > 0;
  const hasUsdc = usdcTotal > 0;

  // Per-vault matrix rows — one row per account, columns for each token.
  // Filtered so empty accounts don't pollute the ledger.
  const vaultRows = [
    { label: "Primary", sol: primarySol, usdc: primaryUsdc },
    ...subVaultBreakdown.map((sv) => ({
      label: sv.name,
      sol: Number.parseFloat(sv.balanceSol) || 0,
      usdc: Number.parseFloat(sv.usdcUi) || 0,
    })),
  ].filter((v) => v.sol > 0 || v.usdc > 0);

  const rowUsd = (v: { sol: number; usdc: number }) =>
    (solPrice != null ? v.sol * solPrice : 0) + v.usdc;

  return (
    <section className="card-hero group">
      <HeraldicWatermark size={360} opacity={0.04} />

      <div className="relative p-6 md:p-8">
        {/* ── Identity + balance ledger ── */}
        <div className="min-w-0">
          {/* Eyebrow + refresh */}
          <div className="flex items-center justify-between">
            <p className="text-eyebrow">Total Treasury · Live</p>
            <button
              type="button"
              onClick={onRefresh}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-ink md:opacity-0 md:group-hover:opacity-100"
              aria-label="Refresh balance"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Hero number — Fraunces optical-size axis at 64px reads as
              private-banking, not as a wallet. */}
          <div className="mt-3">
            {totalUsdPending ? (
              <Skeleton
                className="h-10 w-56 rounded-lg md:h-[60px] md:w-80"
                aria-label="Loading total balance"
              />
            ) : totalUsd != null ? (
              <NumberFlow
                value={totalUsd}
                className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink md:text-6xl"
                prefix="$"
                locales="en-US"
                format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                transformTiming={{ duration: 400, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
              />
            ) : (
              <span className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink md:text-6xl">
                {formatSol(balanceSol)} SOL
              </span>
            )}

            {/* Ledger line — mono SOL · USDC, mid-tone. The audit trail. */}
            <p className="mt-2 font-mono text-sm tabular-nums text-ink-subtle">
              {formatSol(balanceSol, 4)} SOL
              {hasUsdc && (
                <>
                  <span className="px-2 text-ink-subtle/50">·</span>
                  {usdcTotal.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  USDC
                </>
              )}
            </p>

            {/* Details disclosure */}
            {(hasSubVaults || hasUsdc) && (
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="mt-4 inline-flex items-center gap-1 text-[11px] text-ink-subtle/60 transition-aegis hover:text-ink-subtle"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    showBreakdown ? "rotate-180" : "",
                  )}
                />
                {showBreakdown ? "Hide details" : "Show details"}
              </button>
            )}

            {/* Breakdown — same data as before, kept inside the hero so the
                disclosure isn't a separate card stacking-pattern. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                showBreakdown ? "mt-4 grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                {/* Account × token matrix — when sub-vaults exist, every row
                    is a vault and every column is a token. One glance to
                    compare "what's where" without jumping between sections. */}
                {hasSubVaults ? (
                  <div className="overflow-hidden rounded-xl border border-border/60 bg-bg/30">
                    {/* Column header */}
                    <div
                      className={cn(
                        "grid items-center gap-x-5 border-b border-border/50 px-4 py-2",
                        hasUsdc
                          ? "grid-cols-[minmax(4rem,1fr)_auto_auto_auto]"
                          : "grid-cols-[minmax(4rem,1fr)_auto_auto]",
                      )}
                    >
                      <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-subtle/60">
                        Account
                      </span>
                      <span className="flex items-center justify-end gap-1.5 text-[9px] font-medium uppercase tracking-[0.22em] text-ink-subtle/60">
                        <TokenLogo symbol="SOL" size={11} />
                        SOL
                      </span>
                      {hasUsdc && (
                        <span className="flex items-center justify-end gap-1.5 text-[9px] font-medium uppercase tracking-[0.22em] text-ink-subtle/60">
                          <TokenLogo symbol="USDC" size={11} />
                          USDC
                        </span>
                      )}
                      <span className="text-right text-[9px] font-medium uppercase tracking-[0.22em] text-ink-subtle/60">
                        Value
                      </span>
                    </div>

                    {/* Vault rows */}
                    {vaultRows.map((v) => {
                      const vUsd = rowUsd(v);
                      return (
                        <div
                          key={v.label}
                          className={cn(
                            "grid items-baseline gap-x-5 border-t border-border/30 px-4 py-2.5 first:border-t-0",
                            hasUsdc
                              ? "grid-cols-[minmax(4rem,1fr)_auto_auto_auto]"
                              : "grid-cols-[minmax(4rem,1fr)_auto_auto]",
                          )}
                        >
                          <span className="truncate text-[13px] text-ink">{v.label}</span>
                          <span className="text-right font-mono text-[13px] tabular-nums text-ink-muted">
                            {v.sol > 0 ? formatSol(String(v.sol), 4) : "—"}
                          </span>
                          {hasUsdc && (
                            <span className="text-right font-mono text-[13px] tabular-nums text-ink-muted">
                              {v.usdc > 0
                                ? v.usdc.toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "—"}
                            </span>
                          )}
                          <span className="text-right font-mono text-[13px] tabular-nums text-ink">
                            {totalUsdPending ? (
                              <Skeleton className="ml-auto h-3 w-16 rounded" />
                            ) : solPrice != null ? (
                              usd(vUsd)
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
                      );
                    })}

                    {/* Total row — serif label, bold mono total */}
                    <div
                      className={cn(
                        "grid items-baseline gap-x-5 border-t border-border/60 bg-surface-2/30 px-4 py-3",
                        hasUsdc
                          ? "grid-cols-[minmax(4rem,1fr)_auto_auto_auto]"
                          : "grid-cols-[minmax(4rem,1fr)_auto_auto]",
                      )}
                    >
                      <span className="font-display text-[13px] tracking-tight text-ink-muted">
                        Total
                      </span>
                      <span className="text-right font-mono text-[13px] font-medium tabular-nums text-ink">
                        {formatSol(balanceSol, 4)}
                      </span>
                      {hasUsdc && (
                        <span className="text-right font-mono text-[13px] font-medium tabular-nums text-ink">
                          {usdcTotal.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      )}
                      <span className="text-right font-mono text-sm font-medium tabular-nums text-ink">
                        {totalUsdPending ? (
                          <Skeleton className="ml-auto h-3.5 w-20 rounded" />
                        ) : totalUsd != null ? (
                          usd(totalUsd)
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  // Single-vault — collapse to plain token list. No matrix needed.
                  <div className="overflow-hidden rounded-xl border border-border/60 bg-bg/30">
                    <div className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-x-4 border-b border-border/50 px-4 py-2">
                      <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-subtle/60">
                        Asset
                      </span>
                      <span className="text-right text-[9px] font-medium uppercase tracking-[0.22em] text-ink-subtle/60">
                        Holdings
                      </span>
                      <span className="text-right text-[9px] font-medium uppercase tracking-[0.22em] text-ink-subtle/60">
                        Value
                      </span>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-x-4 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <TokenLogo symbol="SOL" size={22} />
                        <span className="text-sm font-medium text-ink">SOL</span>
                      </div>
                      <span className="text-right font-mono text-sm tabular-nums text-ink">
                        {formatSol(balanceSol, 6)}
                      </span>
                      <span className="text-right font-mono text-sm tabular-nums text-ink">
                        {totalUsdPending ? (
                          <Skeleton className="ml-auto h-3.5 w-16 rounded" />
                        ) : solUsd != null ? (
                          usd(solUsd)
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>

                    {hasUsdc && (
                      <div className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-x-4 border-t border-border/40 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <TokenLogo symbol="USDC" size={22} />
                          <span className="text-sm font-medium text-ink">USDC</span>
                        </div>
                        <span className="text-right font-mono text-sm tabular-nums text-ink">
                          {usdcTotal.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span className="text-right font-mono text-sm tabular-nums text-ink">
                          {usd(usdcTotal)}
                        </span>
                      </div>
                    )}

                    {(totalUsd != null || totalUsdPending) && (
                      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-t border-border/60 bg-surface-2/30 px-4 py-3">
                        <span className="font-display text-[13px] tracking-tight text-ink-muted">
                          Total
                        </span>
                        <span className="font-mono text-sm font-medium tabular-nums text-ink">
                          {totalUsdPending ? (
                            <Skeleton className="ml-auto h-3.5 w-20 rounded" />
                          ) : totalUsd != null ? (
                            usd(totalUsd)
                          ) : null}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick actions — horizontal grid under the ledger.
            Send Private keeps the gradient+star treatment so the
            differentiated capability still leads visually, but the
            three actions sit at familiar wallet-equivalent positions. */}
        <div className="mt-6 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onSend}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-aegis sm:gap-2 sm:px-3 sm:text-sm",
              "bg-gradient-to-r from-accent to-accent-hover text-accent-ink shadow-raise-1 hover:shadow-accent-glow",
            )}
          >
            <Lock className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>Send Private</span>
          </button>
          <button
            type="button"
            onClick={onReceive}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-transparent px-2 py-2.5 text-xs font-medium text-ink-muted transition-aegis hover:border-border-strong hover:bg-surface-2 hover:text-ink sm:gap-2 sm:px-3 sm:text-sm"
          >
            <ArrowDownToLine className="h-4 w-4" strokeWidth={1.5} />
            Deposit
          </button>
          <button
            type="button"
            onClick={onSwap}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-transparent px-2 py-2.5 text-xs font-medium text-ink-muted transition-aegis hover:border-border-strong hover:bg-surface-2 hover:text-ink sm:gap-2 sm:px-3 sm:text-sm"
          >
            <ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} />
            Swap
          </button>
        </div>
      </div>

      {!cofreInitialized && (
        <div className="relative border-t border-border/50 px-6 py-4 md:px-8">
          <WarningCallout variant="warning" className="text-xs">
            Private transactions are not active yet. Set up your vault's privacy layer to enable
            shielded sends.
          </WarningCallout>
        </div>
      )}
    </section>
  );
}

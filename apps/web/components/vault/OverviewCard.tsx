"use client";

import { TokenLogo } from "@/components/ui/token-logo";
import { WarningCallout } from "@/components/ui/warning-callout";
import { DepositAddressChip } from "@/components/vault/DepositAddressChip";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import type { SubVaultBalance } from "@/lib/use-vault-data";
import NumberFlow from "@number-flow/react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
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

export function OverviewCard({
  multisig,
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
  const { data: solPrice } = useSolPrice();
  const [showBreakdown, setShowBreakdown] = useState(false);

  const solTotal = Number.parseFloat(balanceSol) || 0;
  const usdcTotal = Number.parseFloat(usdcUi) || 0;
  const solUsd = solPrice != null ? solTotal * solPrice : null;
  const totalUsd = solUsd != null ? solUsd + usdcTotal : null;

  // Per-account breakdown (primary + named sub-vaults with any balance)
  const primarySol = Number.parseFloat(primaryBalanceSol) || 0;
  const accountRows = [
    { label: "Primary", sol: primarySol },
    ...subVaultBreakdown.map((sv) => ({
      label: sv.name,
      sol: Number.parseFloat(sv.balanceSol) || 0,
    })),
  ].filter((r) => r.sol > 0 || subVaultBreakdown.length === 0);

  const hasSubVaults = subVaultBreakdown.length > 0;
  const hasUsdc = usdcTotal > 0;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-raise-1 transition-colors duration-200 hover:border-accent/20">
      <div className="relative p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle/60">
            Total Balance
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle opacity-100 transition-all hover:bg-surface-2 hover:text-ink md:opacity-0 md:group-hover:opacity-100"
            aria-label="Refresh balance"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Big number */}
        <div className="mt-3">
          {totalUsd != null ? (
            <NumberFlow
              value={totalUsd}
              className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink md:text-5xl"
              prefix="$"
              locales="en-US"
              format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
              transformTiming={{ duration: 400, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          ) : (
            <span className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink md:text-5xl">
              {formatSol(balanceSol)} SOL
            </span>
          )}

          {/* SOL pill — always visible below the total */}
          {totalUsd != null && (
            <p className="mt-1 font-mono text-sm text-ink-subtle/60 tabular-nums">
              {formatSol(balanceSol, 6)} SOL
            </p>
          )}

          {/* Details toggle */}
          {(hasSubVaults || hasUsdc) && (
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="mt-3 flex items-center gap-1 text-[11px] text-ink-subtle/50 transition-colors hover:text-ink-subtle"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${showBreakdown ? "rotate-180" : ""}`}
              />
              {showBreakdown ? "Hide details" : "Show details"}
            </button>
          )}

          {/* Breakdown panel */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${showBreakdown ? "mt-4 grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="overflow-hidden">
              <div className="space-y-px rounded-xl border border-border/50 bg-bg/40 overflow-hidden">
                {/* SOL row — always first */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <TokenLogo symbol="SOL" size={20} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">SOL</p>
                    {hasSubVaults && accountRows.length > 1 && (
                      <p className="text-[10px] text-ink-subtle mt-0.5">
                        {accountRows
                          .map((r) => `${r.label} ${formatSol(String(r.sol), 3)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-medium tabular-nums text-ink">
                      {formatSol(balanceSol, 6)}
                    </p>
                    {solUsd != null && (
                      <p className="text-[11px] tabular-nums text-ink-subtle/50">{usd(solUsd)}</p>
                    )}
                  </div>
                </div>

                {/* USDC row — only when balance > 0 */}
                {hasUsdc && (
                  <div className="flex items-center gap-3 border-t border-border/40 px-4 py-3">
                    <TokenLogo symbol="USDC" size={20} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink">USDC</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium tabular-nums text-ink">
                        {usdcTotal.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[11px] tabular-nums text-ink-subtle/50">
                        {usd(usdcTotal)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onSend}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-2 py-2.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover sm:gap-2 sm:px-3 sm:text-sm"
          >
            <ArrowUpFromLine className="h-4 w-4" strokeWidth={1.5} />
            Send
          </button>
          <button
            type="button"
            onClick={onReceive}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-transparent px-2 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink sm:gap-2 sm:px-3 sm:text-sm"
          >
            <ArrowDownToLine className="h-4 w-4" strokeWidth={1.5} />
            Deposit
          </button>
          <button
            type="button"
            onClick={onSwap}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-transparent px-2 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink sm:gap-2 sm:px-3 sm:text-sm"
          >
            <ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} />
            Swap
          </button>
        </div>

        <div className="mt-5">
          <DepositAddressChip multisig={multisig} vaultIndex={0} vaultName="Primary" />
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

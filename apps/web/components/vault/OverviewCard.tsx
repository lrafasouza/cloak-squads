"use client";

import { WarningCallout } from "@/components/ui/warning-callout";
import { DirectSendModal } from "@/components/vault/DirectSendModal";
import { QuickActionButton } from "@/components/vault/QuickActionButton";
import { ReceiveModal } from "@/components/vault/ReceiveModal";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";

interface OverviewCardProps {
  multisig: string;
  balanceSol: string;
  cofreInitialized: boolean;
  onRefresh: () => void;
}

export function OverviewCard({
  multisig,
  balanceSol,
  cofreInitialized,
  onRefresh,
}: OverviewCardProps) {
  const base = `/vault/${multisig}`;
  const { data: solPrice } = useSolPrice();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const usdValue =
    solPrice != null
      ? (parseFloat(balanceSol) * solPrice).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        })
      : null;

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-5 shadow-raise-1">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
            Total Balance
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Refresh balance"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-1 text-3xl font-bold tabular-nums text-ink">
          {balanceSol}{" "}
          <span className="text-lg font-medium text-ink-muted">SOL</span>
        </p>

        {usdValue != null && (
          <p className="mt-0.5 text-sm font-medium text-ink-subtle tabular-nums">{usdValue}</p>
        )}

        {!cofreInitialized && (
          <WarningCallout variant="warning" className="mt-3">
            Privacy vault not initialized. Bootstrap Aegis to enable private transactions.
          </WarningCallout>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <QuickActionButton
            icon={ArrowDownToLine}
            label="Receive"
            onClick={() => setReceiveOpen(true)}
          />
          <QuickActionButton
            icon={ArrowUpFromLine}
            label="Send (Public)"
            onClick={() => setSendOpen(true)}
          />
          <QuickActionButton href={`${base}/invoice`} icon={BookOpen} label="Invoice" />
          <QuickActionButton href={`${base}/payroll`} icon={Zap} label="Payroll" />
        </div>

      </div>

      <ReceiveModal multisig={multisig} open={receiveOpen} onOpenChange={setReceiveOpen} />
      <DirectSendModal multisig={multisig} open={sendOpen} onOpenChange={setSendOpen} />
    </>
  );
}

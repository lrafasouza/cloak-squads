"use client";

import { ReceiptRow } from "@/components/ui/receipt-row";
import type { DeployFeeBreakdown as DeployFeeBreakdownValue } from "@/lib/deploy-fee";
import { lamportsToSol } from "@/lib/sol";

interface DeployFeeBreakdownProps {
  fee: DeployFeeBreakdownValue | null;
}

function sol(value: number) {
  return lamportsToSol(String(value));
}

export function DeployFeeBreakdown({ fee }: DeployFeeBreakdownProps) {
  if (!fee) {
    return (
      <div className="mt-5 rounded-md border border-border bg-surface-2 px-3.5 py-3 text-[11px] italic text-ink-muted">
        Estimating deploy fee from the current RPC…
      </div>
    );
  }

  const rows: Array<readonly [string, number]> = [
    ["Squads protocol", fee.squadsProtocolFeeLamports],
    ["Aegis registration", fee.aegisRegistrationFeeLamports],
    ["Vault rent reserve", fee.vaultRentReserveLamports],
    ["Network rent estimate", fee.estimatedNetworkRentLamports],
    ["Transaction fee estimate", fee.estimatedTransactionFeeLamports],
  ];

  return (
    <div className="mt-5 rounded-md border border-border bg-surface-2/60 px-4 pb-3 pt-3.5">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-eyebrow">Deploy fee breakdown</p>
        <span className="font-mono text-xs tabular-nums text-ink">
          ~{sol(fee.totalLamports)} SOL
        </span>
      </div>

      <div className="mt-2">
        {rows.map(([label, lamports]) => (
          <ReceiptRow key={label} label={label} tone="muted">
            {sol(lamports)} SOL
          </ReceiptRow>
        ))}
      </div>

      <p className="mt-3 text-[11px] italic leading-relaxed text-ink-subtle/80">
        The vault rent reserve is deposited into your Squads vault and remains yours.
      </p>
    </div>
  );
}

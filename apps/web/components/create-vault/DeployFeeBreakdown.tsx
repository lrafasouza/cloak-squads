"use client";

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
      <div className="mt-4 rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-xs text-ink-muted">
        Estimating deploy fee from the current RPC...
      </div>
    );
  }

  const rows = [
    ["Squads protocol", fee.squadsProtocolFeeLamports],
    ["Aegis registration", fee.aegisRegistrationFeeLamports],
    ["Vault rent reserve", fee.vaultRentReserveLamports],
    ["Network rent estimate", fee.estimatedNetworkRentLamports],
    ["Transaction fee estimate", fee.estimatedTransactionFeeLamports],
  ] as const;

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-2 px-3.5 py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-subtle">Deploy fee breakdown</span>
        <span className="font-mono text-ink">~{sol(fee.totalLamports)} SOL</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map(([label, lamports]) => (
          <div key={label} className="flex items-center justify-between text-xs text-ink-muted">
            <span>{label}</span>
            <span className="font-mono">{sol(lamports)} SOL</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
        The vault rent reserve is deposited into your Squads vault and remains yours.
      </p>
    </div>
  );
}

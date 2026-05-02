"use client";

import { AddressPill } from "@/components/ui/address-pill";
import Link from "next/link";

export function AccountsTab({
  multisig,
  vaultAddress,
  balanceSol,
}: {
  multisig: string;
  vaultAddress: string;
  balanceSol: string;
}) {
  return (
    <div className="rounded-2xl bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle">Accounts</h3>
        <Link href={`/vault/${multisig}/settings`} className="text-xs text-ink-subtle transition-colors hover:text-accent">Manage</Link>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">Vault</p>
          <div className="mt-1"><AddressPill value={vaultAddress} chars={6} /></div>
        </div>
        <p className="font-mono text-sm font-medium tabular-nums text-accent">{balanceSol} SOL</p>
      </div>
    </div>
  );
}

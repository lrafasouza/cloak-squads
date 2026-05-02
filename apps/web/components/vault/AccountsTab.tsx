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
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Accounts</h3>
        <Link
          href={`/vault/${multisig}/settings`}
          className="text-xs text-ink-subtle hover:text-ink"
        >
          Manage
        </Link>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-ink">Vault account</p>
          <div className="mt-1">
            <AddressPill value={vaultAddress} chars={6} />
          </div>
        </div>
        <p className="font-mono text-sm text-ink">{balanceSol} SOL</p>
      </div>
    </div>
  );
}

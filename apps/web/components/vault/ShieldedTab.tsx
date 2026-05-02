"use client";

import { useShieldedBalance } from "@/lib/hooks/useShieldedBalance";
import { Shield } from "lucide-react";

export function ShieldedTab({ multisig }: { multisig: string }) {
  const { data, isLoading } = useShieldedBalance(multisig);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-ink">Shielded</h3>
      </div>
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
          Cloak balance
        </p>
        <p className="mt-1 text-2xl font-bold text-ink">
          {isLoading ? "--" : (data?.balanceSol ?? "0")}{" "}
          <span className="text-sm font-medium text-ink-muted">SOL</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Derived from local Cloak deposit records until viewing-key scan is wired end to end.
        </p>
      </div>
    </div>
  );
}

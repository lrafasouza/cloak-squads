"use client";

import { WorkspaceHeader, WorkspacePage } from "@/components/ui/workspace";
import { PrivacyMeter } from "@/components/vault/PrivacyMeter";
import { use } from "react";

export default function PrivacyPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  use(params);

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Privacy"
        title="Pool privacy stats"
        description="Live anonymity set data from the Cloak devnet shielded pool."
      />

      <div className="max-w-lg space-y-6">
        <PrivacyMeter />

        <div className="rounded-xl border border-border bg-surface p-5 space-y-4 text-sm text-ink-muted">
          <h3 className="font-semibold text-ink">How Aegis privacy works</h3>
          <ul className="space-y-2 list-disc list-inside">
            <li>
              <strong className="text-ink">Vault → Operator</strong>: this hop is public on-chain.
              Observers can see your vault funding the operator wallet.
            </li>
            <li>
              <strong className="text-ink">Operator → Cloak pool</strong>: the operator deposits
              into the shielded pool. From this point, your funds are mixed with every other
              depositor's funds.
            </li>
            <li>
              <strong className="text-ink">Pool → Recipient</strong>: the withdrawal is unlinkable
              to your deposit because the pool has many other deposits to choose from. This is the
              anonymity set.
            </li>
          </ul>
          <p className="text-xs">
            A larger anonymity set means a lower probability that any observer can correlate your
            deposit with a specific withdrawal. {">"} 1,000 deposits = low risk.
          </p>
        </div>
      </div>
    </WorkspacePage>
  );
}

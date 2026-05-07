"use client";

import type { ProposalSummary } from "@/lib/proposals";
import Link from "next/link";
import { useEffect, useState } from "react";

export function PendingProposalsCard({
  multisig,
  proposals,
}: {
  multisig: string;
  proposals: ProposalSummary[];
}) {
  const [subVaultAccounts, setSubVaultAccounts] = useState<Array<{ vaultIndex: number; name: string }>>([]);
  useEffect(() => {
    fetch(`/api/vaults/${multisig}/sub-vaults`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ vaultIndex: number; name: string }>) => setSubVaultAccounts(data))
      .catch(() => {});
  }, [multisig]);
  const resolveVaultName = (idx: number | undefined): string | null => {
    if (idx === undefined || idx === 0) return null;
    return subVaultAccounts.find((sv) => sv.vaultIndex === idx)?.name ?? `Vault #${idx}`;
  };

  const pending = proposals.filter(
    (p) => p.status === "active" || p.status === "approved" || p.status === "draft",
  );

  // Empty state — keep the card present so the dashboard layout stays
  // stable and to surface a clear "next action" CTA. Eliminates the dead
  // hole that appeared whenever the queue drained.
  if (pending.length === 0) {
    return (
      <div className="card-panel flex flex-col items-start gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-eyebrow">Proposal Queue</p>
          <p className="mt-2 text-sm text-ink">No proposals awaiting signatures.</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            Send a payment, run payroll, or initiate a swap to start one.
          </p>
        </div>
        <Link
          href={`/vault/${multisig}/send`}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-transparent px-3.5 text-xs font-semibold text-ink transition-aegis hover:bg-surface-2"
        >
          New transaction
        </Link>
      </div>
    );
  }

  return (
    <div className="card-panel">
      {/* Header */}
      <div className="flex items-end justify-between px-5 pt-5 pb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
            {pending.length}
          </span>
          <span className="text-eyebrow">
            Pending {pending.length === 1 ? "Proposal" : "Proposals"}
          </span>
        </div>
        <Link
          href={`/vault/${multisig}/proposals`}
          className="text-xs text-ink-subtle transition-aegis hover:text-accent"
        >
          View all
        </Link>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/50 mx-5" />

      {/* Rows */}
      <div className="flex flex-col p-2">
        {pending.slice(0, 5).map((p) => {
          const approvals = p.approvals ?? 0;
          const threshold = p.threshold ?? 1;
          const dots = Math.min(threshold, 6);

          return (
            <Link
              key={p.id}
              href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
              className="group flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  <span className="mr-1.5 font-mono text-[11px] text-ink-subtle">
                    #{p.transactionIndex}
                  </span>
                  {p.title}
                  {(() => {
                    const name = resolveVaultName(p.sourceVaultIndex);
                    return name ? (
                      <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                        From {name}
                      </span>
                    ) : null;
                  })()}
                </p>
                {p.memo && (
                  <p className="mt-0.5 truncate text-xs text-ink-subtle">{p.memo}</p>
                )}
              </div>

              {/* Approval dots */}
              <div className="ml-4 flex shrink-0 items-center gap-1">
                {Array.from({ length: dots }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${
                      i < approvals ? "bg-accent" : "bg-border-strong"
                    }`}
                  />
                ))}
                {threshold > 6 && (
                  <span className="text-[10px] text-ink-subtle">+{threshold - 6}</span>
                )}
                <span className="ml-1.5 font-mono text-[10px] tabular-nums text-ink-subtle">
                  {approvals}/{threshold}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { type ProposalSummary, truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import Link from "next/link";

export function PendingProposalsCard({
  multisig,
  proposals,
}: {
  multisig: string;
  proposals: ProposalSummary[];
}) {
  const pending = proposals.filter(
    (p) => p.status === "active" || p.status === "approved" || p.status === "draft",
  );
  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Pending Proposals</h3>
        <Link
          href={`/vault/${multisig}/proposals`}
          className="text-xs text-ink-subtle hover:text-ink"
        >
          View all
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {pending.slice(0, 5).map((p) => {
          const summary =
            p.type === "payroll"
              ? `Payroll - ${p.recipientCount ?? "?"} recipients`
              : p.amount && p.amount !== "0"
                ? `${lamportsToSol(p.amount)} SOL to ${truncateAddress(p.recipient)}`
                : p.memo || "Config change";
          const sigProgress =
            p.approvals != null && p.threshold != null ? `${p.approvals}/${p.threshold}` : "--";

          return (
            <Link
              key={p.id}
              href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm transition-colors hover:border-border-strong"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  #{p.transactionIndex} {summary}
                </p>
                {p.memo && <p className="truncate text-xs text-ink-subtle">{p.memo}</p>}
              </div>
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                {sigProgress}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

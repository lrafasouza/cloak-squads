"use client";

import type { ProposalSummary } from "@/lib/proposals";
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
    <div className="rounded-2xl border border-border/60 bg-surface transition-all duration-300 hover:border-accent/10">
      <div className="mb-4 flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle">Pending Proposals</h3>
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-ink tabular-nums">
            {pending.length}
          </span>
        </div>
        <Link href={`/vault/${multisig}/proposals`} className="text-xs text-ink-subtle transition-colors hover:text-accent">View all</Link>
      </div>
      <div className="flex flex-col gap-2 px-5 pb-5">
        {pending.slice(0, 5).map((p) => {
          const sigProgress =
            p.approvals != null && p.threshold != null ? `${p.approvals}/${p.threshold}` : "--";

          return (
            <Link
              key={p.id}
              href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
              className="group flex items-center justify-between rounded-xl border border-transparent bg-surface-2 px-4 py-3 text-sm transition-all duration-200 hover:border-border hover:bg-surface-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  <span className="text-ink-subtle">#{p.transactionIndex}</span>{" "}{p.title}
                </p>
                {p.memo && <p className="truncate text-xs text-ink-subtle">{p.memo}</p>}
              </div>
              <span className="rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent ring-1 ring-accent/10">
                {sigProgress}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

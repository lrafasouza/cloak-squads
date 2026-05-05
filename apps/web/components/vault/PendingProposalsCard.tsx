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
    <div className="rounded-2xl border border-border/60 bg-surface transition-colors duration-200 hover:border-accent/15">
      {/* Header */}
      <div className="flex items-end justify-between px-5 pt-5 pb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
            {pending.length}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle">
            Pending {pending.length === 1 ? "Proposal" : "Proposals"}
          </span>
        </div>
        <Link
          href={`/vault/${multisig}/proposals`}
          className="text-xs text-ink-subtle transition-colors hover:text-accent"
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

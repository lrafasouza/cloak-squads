"use client";

import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { ArrowLeftRight, ChevronDown } from "lucide-react";
import { useState } from "react";

interface SwapHistoryProps {
  multisig: string;
}

const statusDot = {
  executed: "bg-signal-positive",
  rejected: "bg-signal-danger",
  cancelled: "bg-signal-danger",
  draft: "bg-ink-subtle",
  active: "bg-signal-warn",
  approved: "bg-accent",
  executing: "bg-accent",
  unknown: "bg-ink-subtle",
};

export function SwapHistory({ multisig }: SwapHistoryProps) {
  const [open, setOpen] = useState(false);
  const { data: proposals = [] } = useProposalSummaries(multisig);

  const swapProposals = proposals
    .filter((p) => p.memo?.toLowerCase().includes("swap"))
    .slice(0, 10);

  const hasItems = swapProposals.length > 0;

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Toggle header — PanelHeader style */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/30"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-subtle">
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Recent Swaps</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {hasItems ? `${swapProposals.length} swap proposals` : "No proposals yet"}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Animated content */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border pb-2 pt-1">
            {hasItems ? (
              <div className="space-y-1">
                {swapProposals.map((p) => (
                  <div
                    key={p.transactionIndex}
                    className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-surface-2/50"
                  >
                    <div>
                      <p className="text-sm text-ink">
                        {p.memo ?? `Proposal #${p.transactionIndex}`}
                      </p>
                      <p className="text-[11px] text-ink-subtle/60">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-subtle/50 capitalize">{p.status}</span>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${statusDot[p.status ?? "unknown"]}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-sm font-medium text-ink">No swap proposals yet</p>
                <p className="mt-1 text-sm text-ink-subtle/60">
                  Create your first swap proposal and it will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

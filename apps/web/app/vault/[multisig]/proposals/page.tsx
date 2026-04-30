"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { type ProposalSummary, truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { Archive, ArrowRightLeft, Clock, FileText, Loader2, Send, Users } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";

type TabId = "queue" | "history" | "drafts";

const TABS: { id: TabId; label: string; icon: typeof Clock }[] = [
  { id: "queue", label: "Queue", icon: Clock },
  { id: "history", label: "History", icon: Archive },
  { id: "drafts", label: "Drafts", icon: FileText },
];

function kindIcon(type: ProposalSummary["type"]) {
  switch (type) {
    case "payroll":
      return <Users className="h-4 w-4 text-accent" />;
    case "single":
      return <Send className="h-4 w-4 text-accent" />;
    default:
      return <ArrowRightLeft className="h-4 w-4 text-accent" />;
  }
}

function statusBadge(status?: string) {
  if (!status) return null;
  const map: Record<string, string> = {
    active: "bg-signal-warn/15 text-signal-warn",
    approved: "bg-accent-soft text-accent",
    draft: "bg-surface-2 text-ink-muted",
    executed: "bg-signal-success/15 text-signal-success",
    rejected: "bg-signal-danger/15 text-signal-danger",
    cancelled: "bg-surface-2 text-ink-subtle",
    executeFailed: "bg-signal-danger/15 text-signal-danger",
  };
  const cls = map[status] ?? "bg-surface-2 text-ink-muted";
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ProposalRow({ multisig, p }: { multisig: string; p: ProposalSummary }) {
  const summary =
    p.type === "payroll"
      ? `Payroll • ${p.recipientCount ?? "?"} recipients`
      : p.amount && p.amount !== "0"
        ? `${lamportsToSol(p.amount)} SOL → ${truncateAddress(p.recipient)}`
        : p.memo || "Config change";

  const sigProgress =
    p.approvals != null && p.threshold != null ? `${p.approvals}/${p.threshold}` : null;

  const actionLabel =
    p.status === "active" && (p.approvals ?? 0) < (p.threshold ?? 0)
      ? "Sign"
      : p.status === "approved" ||
          (p.status === "active" && (p.approvals ?? 0) >= (p.threshold ?? 0))
        ? "Execute"
        : "View";

  return (
    <Link
      href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <div className="shrink-0">{kindIcon(p.type)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-accent">#{p.transactionIndex}</span>
          <span className="truncate text-sm text-ink">{summary}</span>
        </div>
        {p.memo && <p className="truncate text-xs text-ink-subtle">{p.memo}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {sigProgress && (
          <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
            {sigProgress}
          </span>
        )}
        {statusBadge(p.status)}
        <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink">
          {actionLabel}
        </span>
      </div>
    </Link>
  );
}

export default function TransactionsPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { data: proposals = [], isLoading } = useProposalSummaries(multisig);
  const [activeTab, setActiveTab] = useState<TabId>("queue");

  const grouped = useMemo(() => {
    const queue = proposals.filter((p) => p.status === "active" || p.status === "approved");
    const history = proposals.filter(
      (p) => p.status === "executed" || p.status === "rejected" || p.status === "cancelled",
    );
    const drafts = proposals.filter((p) => p.status === "draft" || (!p.status && p.hasDraft));
    return { queue, history, drafts };
  }, [proposals]);

  const items = grouped[activeTab];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Transactions</h1>
          <p className="text-xs text-ink-muted">Manage proposals, approvals, and executions</p>
        </div>
        <Link
          href={`/vault/${multisig}/send`}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover"
        >
          <Send className="h-4 w-4" />
          New Transaction
        </Link>
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {TABS.map((tab) => {
          const count = grouped[tab.id].length;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {count > 0 && (
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-ink-muted">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading transactions…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={activeTab === "queue" ? Clock : activeTab === "history" ? Archive : FileText}
          title={
            activeTab === "queue"
              ? "No pending transactions"
              : activeTab === "history"
                ? "No transaction history"
                : "No drafts"
          }
          description={
            activeTab === "queue"
              ? "All proposals have been processed. New ones will appear here."
              : activeTab === "history"
                ? "Executed and rejected transactions will show up here."
                : "Drafts from payroll or send will appear here before submission."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((p) => (
            <ProposalRow key={p.id} multisig={multisig} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

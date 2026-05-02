"use client";

import { ConfirmModal } from "@/components/ui/confirm-modal";
import { type IncomeEntry, useVaultIncome } from "@/lib/hooks/useVaultIncome";
import { type ProposalSummary, truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { proposalCancel } from "@/lib/squads-sdk";
import { proposalSummariesQueryKey, useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  EyeOff,
  ExternalLink,
  Loader2,
  Plus,
  Send,
  Users,
  X,
} from "lucide-react";
import { publicEnv } from "@/lib/env";
import Link from "next/link";
import { use, useMemo, useState } from "react";

type TabId = "queue" | "history" | "drafts" | "income";

const CLUSTER = publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "" : "?cluster=devnet";

const STATUS_DOT: Record<string, string> = {
  active: "bg-signal-warn animate-pulse",
  approved: "bg-accent",
  executed: "bg-signal-positive",
  rejected: "bg-signal-danger",
  cancelled: "bg-ink-subtle",
  draft: "bg-ink-subtle",
};

const STATUS_TEXT: Record<string, string> = {
  active: "Awaiting",
  approved: "Ready",
  executed: "Executed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  draft: "Draft",
};

const KIND_LABEL: Record<ProposalSummary["type"], string> = {
  payroll: "Payroll",
  single: "Transfer",
  onchain: "Config",
};

function KindIcon({ type }: { type: ProposalSummary["type"] }) {
  const cls = "h-3.5 w-3.5";
  if (type === "payroll") return <Users className={cls} />;
  if (type === "single") return <Send className={cls} />;
  return <ArrowRightLeft className={cls} />;
}

function ApprovalDots({ approvals, threshold }: { approvals: number; threshold: number }) {
  const capped = Math.min(threshold, 8);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: capped }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full transition-colors ${i < approvals ? "bg-accent" : "bg-border-strong"}`}
        />
      ))}
      <span className="ml-1.5 text-xs tabular-nums text-ink-muted">
        {approvals}/{threshold}
      </span>
    </div>
  );
}

function ProposalRow({
  multisig,
  p,
  isHistory,
  onCancel,
  onHide,
  cancelling,
}: {
  multisig: string;
  p: ProposalSummary;
  isHistory?: boolean;
  onCancel?: (p: ProposalSummary) => void;
  onHide?: (id: string) => void;
  cancelling?: boolean;
}) {
  const description =
    p.type === "payroll"
      ? `${p.recipientCount ?? "?"} recipients · ${lamportsToSol(p.totalAmount ?? "0")} SOL`
      : p.amount && p.amount !== "0"
        ? `${lamportsToSol(p.amount)} SOL → ${truncateAddress(p.recipient)}`
        : p.memo || "Configuration change";

  const dot = STATUS_DOT[p.status ?? "draft"] ?? "bg-ink-subtle";
  const label = STATUS_TEXT[p.status ?? ""] ?? p.status ?? "—";

  return (
    <div className="group relative grid items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2" style={{ gridTemplateColumns: "3rem 7rem 1fr 9rem 6rem 7rem" }}>
      <Link
        href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
        className="absolute inset-0"
        aria-label={`View proposal #${p.transactionIndex}`}
      />
      <span className="relative font-mono text-sm font-medium text-ink-subtle z-10 pointer-events-none">
        #{p.transactionIndex}
      </span>
      <div className="relative flex items-center gap-1.5 text-xs font-medium text-ink-muted z-10 pointer-events-none">
        <KindIcon type={p.type} />
        {KIND_LABEL[p.type]}
      </div>
      <div className="relative min-w-0 z-10 pointer-events-none">
        <p className="truncate text-sm text-ink">{description}</p>
        {p.memo && p.type !== "single" && (
          <p className="truncate text-xs text-ink-subtle">{p.memo}</p>
        )}
      </div>
      <div className="relative flex justify-end z-10 pointer-events-none">
        {p.approvals != null && p.threshold != null ? (
          <ApprovalDots approvals={p.approvals} threshold={p.threshold} />
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        )}
      </div>
      <div className="relative flex items-center justify-end gap-1.5 z-10 pointer-events-none">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="text-sm text-ink-muted">{label}</span>
      </div>
      <div className="relative flex items-center justify-end gap-1 z-20">
        {!isHistory && p.status === "active" && onCancel && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancel(p); }}
            disabled={cancelling}
            title="Cancel proposal"
            className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-signal-danger/15 hover:text-signal-danger disabled:opacity-40"
          >
            {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          </button>
        )}
        {isHistory && onHide && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onHide(p.id); }}
            title="Hide from history"
            className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-3 hover:text-ink"
          >
            <EyeOff className="h-3 w-3" />
          </button>
        )}
        <Link
          href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
          onClick={(e) => e.stopPropagation()}
          className="relative z-20 rounded px-2 py-0.5 text-xs font-medium text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent-soft hover:text-accent"
        >
          {p.status === "active" ? "Sign" : p.status === "approved" ? "Execute" : "View"}
        </Link>
      </div>
    </div>
  );
}

function formatDate(blockTime: number) {
  const d = new Date(blockTime * 1000);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function IncomeRow({ entry }: { entry: IncomeEntry }) {
  const solAmount = lamportsToSol(entry.amountLamports);
  const explorerUrl = `https://solscan.io/tx/${entry.signature}${CLUSTER}`;

  return (
    <div className="group grid items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2" style={{ gridTemplateColumns: "1fr 1fr 8rem 5rem" }}>
      {/* Amount */}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal-positive/15">
          <ArrowDownToLine className="h-3 w-3 text-signal-positive" />
        </span>
        <span className="font-mono text-sm font-semibold text-signal-positive tabular-nums">
          +{solAmount} SOL
        </span>
      </div>

      {/* From */}
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-ink-muted" title={entry.from}>
          {entry.from === "Unknown" ? (
            <span className="text-ink-subtle italic">Unknown sender</span>
          ) : (
            truncateAddress(entry.from)
          )}
        </p>
      </div>

      {/* Date */}
      <div className="text-right text-xs text-ink-muted tabular-nums">
        {formatDate(entry.blockTime)}
      </div>

      {/* Explorer link */}
      <div className="flex justify-end">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-3 hover:text-ink"
        >
          Solscan
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export default function TransactionsPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { data: proposals = [], isLoading: proposalsLoading } = useProposalSummaries(multisig);
  const { data: incomeEntries = [], isLoading: incomeLoading } = useVaultIncome(multisig, 50);
  const [activeTab, setActiveTab] = useState<TabId>("queue");
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const [cancelTarget, setCancelTarget] = useState<ProposalSummary | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`aegis:archived:${multisig}`) ?? "[]") as string[];
      return new Set(stored);
    } catch {
      return new Set();
    }
  });

  const multisigAddress = useMemo(() => {
    try { return new PublicKey(multisig); } catch { return null; }
  }, [multisig]);

  async function confirmCancel() {
    if (!cancelTarget || !wallet.publicKey || !multisigAddress || !wallet.sendTransaction) return;
    setCancelling(true);
    try {
      await proposalCancel({
        connection,
        wallet: { publicKey: wallet.publicKey, sendTransaction: wallet.sendTransaction },
        multisigPda: multisigAddress,
        transactionIndex: BigInt(cancelTarget.transactionIndex),
      });
      await queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
    } catch {
      // swallow
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  }

  function hideProposal(id: string) {
    const next = new Set(archivedIds);
    next.add(id);
    setArchivedIds(next);
    try {
      localStorage.setItem(`aegis:archived:${multisig}`, JSON.stringify([...next]));
    } catch { /* ignore */ }
  }

  const grouped = useMemo(() => {
    const queue = proposals.filter((p) => p.status === "active" || p.status === "approved");
    const history = proposals.filter(
      (p) =>
        (p.status === "executed" || p.status === "rejected" || p.status === "cancelled") &&
        !archivedIds.has(p.id),
    );
    const drafts = proposals.filter((p) => p.status === "draft" || (!p.status && p.hasDraft));
    return { queue, history, drafts };
  }, [proposals, archivedIds]);

  const isLoading = activeTab === "income" ? incomeLoading : proposalsLoading;

  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: "queue", label: "Queue", count: grouped.queue.length },
    { id: "history", label: "History", count: grouped.history.length },
    { id: "drafts", label: "Drafts", count: grouped.drafts.length },
    { id: "income", label: "Income", count: incomeEntries.length },
  ];

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Transactions</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {grouped.queue.length > 0
              ? `${grouped.queue.length} pending · ${proposals.length} total`
              : `${proposals.length} total`}
          </p>
        </div>
        <Link
          href={`/vault/${multisig}/send`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          New transaction
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-raise-1">
        {/* Tabs */}
        <div className="flex items-center gap-0.5 border-b border-border px-3 py-2">
          {TABS.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === id
                  ? id === "income"
                    ? "bg-signal-positive/10 text-signal-positive"
                    : "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {id === "income" && <ArrowDownToLine className="h-3 w-3" />}
              {label}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    activeTab === id
                      ? id === "income"
                        ? "bg-signal-positive/20 text-signal-positive"
                        : "bg-accent/20 text-accent"
                      : "bg-surface-3 text-ink-subtle"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Column headers */}
        {activeTab === "income" ? (
          !isLoading && incomeEntries.length > 0 && (
            <div
              className="grid items-center gap-4 border-b border-border/50 px-5 py-2"
              style={{ gridTemplateColumns: "1fr 1fr 8rem 5rem" }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Amount</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">From</span>
              <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Date</span>
              <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Tx</span>
            </div>
          )
        ) : (
          !isLoading && grouped[activeTab as Exclude<TabId, "income">]?.length > 0 && (
            <div
              className="grid items-center gap-4 border-b border-border/50 px-5 py-2"
              style={{ gridTemplateColumns: "3rem 7rem 1fr 9rem 6rem 7rem" }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">#</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Type</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Details</span>
              <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Approvals</span>
              <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Status</span>
              <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Action</span>
            </div>
          )
        )}

        {/* Rows */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : activeTab === "income" ? (
          incomeEntries.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-ink-muted">No incoming transfers yet</p>
              <p className="mt-1 text-xs text-ink-subtle">
                SOL sent directly to this vault will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {incomeEntries.map((entry) => (
                <IncomeRow key={entry.signature} entry={entry} />
              ))}
            </div>
          )
        ) : (
          (() => {
            const items = grouped[activeTab as Exclude<TabId, "income">] ?? [];
            return items.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-ink-muted">
                  {activeTab === "queue"
                    ? "No pending transactions"
                    : activeTab === "history"
                      ? "No history yet"
                      : "No drafts saved"}
                </p>
                {activeTab === "queue" && (
                  <p className="mt-1 text-xs text-ink-subtle">
                    New proposals will appear here once submitted.
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {items.map((p) => (
                  <ProposalRow
                    key={p.id}
                    multisig={multisig}
                    p={p}
                    isHistory={activeTab === "history"}
                    {...(activeTab === "queue" ? { onCancel: (target: ProposalSummary) => setCancelTarget(target) } : {})}
                    {...(activeTab === "history" ? { onHide: hideProposal } : {})}
                    cancelling={cancelling && cancelTarget?.id === p.id}
                  />
                ))}
              </div>
            );
          })()
        )}
      </div>

      <ConfirmModal
        open={cancelTarget !== null}
        title="Cancel proposal"
        description={`Cancel proposal #${cancelTarget?.transactionIndex}? This action cannot be undone and will be recorded on-chain.`}
        confirmText="Cancel proposal"
        confirmVariant="destructive"
        isLoading={cancelling}
        onConfirm={() => void confirmCancel()}
        onCancel={() => { if (!cancelling) setCancelTarget(null); }}
      />
    </div>
  );
}

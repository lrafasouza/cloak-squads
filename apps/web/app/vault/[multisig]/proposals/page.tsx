"use client";

import { ConfirmModal } from "@/components/ui/confirm-modal";
import { type IncomeEntry, useVaultIncome } from "@/lib/hooks/useVaultIncome";
import { type ProposalSummary, truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { proposalCancel, proposalReject } from "@/lib/squads-sdk";
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
  onchain: "Settings",
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

function ProposalQueueRow({
  multisig,
  p,
  onCancel,
  cancelling,
}: {
  multisig: string;
  p: ProposalSummary;
  onCancel?: (p: ProposalSummary) => void;
  cancelling?: boolean;
}) {
  const description =
    p.type === "payroll"
      ? `${p.recipientCount ?? "?"} recipients`
      : p.amount && p.amount !== "0"
        ? `${lamportsToSol(p.amount)} SOL`
        : p.title || p.memo || "Configuration change";

  const recipient =
    p.type === "single" && p.recipient
      ? truncateAddress(p.recipient)
      : null;

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
        <p className="truncate text-sm font-medium text-ink">{description}</p>
        {recipient && (
          <p className="truncate font-mono text-xs text-ink-subtle">{recipient}</p>
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
        <span className="text-xs font-medium text-ink-muted">{label}</span>
      </div>
      <div className="relative flex items-center justify-end gap-1.5 z-20">
        {(p.status === "active" || p.status === "approved") && onCancel && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancel(p); }}
            disabled={cancelling}
            title={p.status === "approved" ? "Cancel proposal" : "Reject proposal"}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-signal-danger/30 bg-signal-danger/10 text-signal-danger opacity-60 transition-all hover:opacity-100 hover:bg-signal-danger/20 hover:border-signal-danger/50 group-hover:opacity-80 disabled:opacity-30"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}
        <Link
          href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
          onClick={(e) => e.stopPropagation()}
          className="relative z-20 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-raise-1 transition-opacity hover:opacity-90"
        >
          {p.status === "active" ? "Sign" : p.status === "approved" ? "Execute" : "View"}
        </Link>
      </div>
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
        : p.title || p.memo || "Configuration change";

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
      <div className="relative flex items-center justify-end gap-1.5 z-20">
        {!isHistory && (p.status === "active" || p.status === "approved") && onCancel && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancel(p); }}
            disabled={cancelling}
            title={p.status === "approved" ? "Cancel proposal" : "Reject proposal"}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-signal-danger/30 bg-signal-danger/10 text-signal-danger opacity-60 transition-all hover:opacity-100 hover:bg-signal-danger/20 hover:border-signal-danger/50 group-hover:opacity-80 disabled:opacity-30"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}
        {isHistory && onHide && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onHide(p.id); }}
            title="Hide from history"
            className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle transition-opacity md:opacity-0 md:group-hover:opacity-100 hover:bg-surface-3 hover:text-ink"
          >
            <EyeOff className="h-3 w-3" />
          </button>
        )}
        <Link
          href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
          onClick={(e) => e.stopPropagation()}
          className="relative z-20 rounded px-2 py-0.5 text-xs font-medium text-ink-muted transition-opacity md:opacity-0 md:group-hover:opacity-100 hover:bg-accent-soft hover:text-accent"
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
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-ink-subtle transition-opacity md:opacity-0 md:group-hover:opacity-100 hover:bg-surface-3 hover:text-ink"
        >
          Solscan
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/* ── Mobile cards ── */
function ProposalQueueMobileCard({
  multisig,
  p,
  onCancel,
  cancelling,
}: {
  multisig: string;
  p: ProposalSummary;
  onCancel?: (p: ProposalSummary) => void;
  cancelling?: boolean;
}) {
  const description =
    p.type === "payroll"
      ? `${p.recipientCount ?? "?"} recipients`
      : p.amount && p.amount !== "0"
        ? `${lamportsToSol(p.amount)} SOL`
        : p.title || p.memo || "Configuration change";

  const recipient =
    p.type === "single" && p.recipient ? truncateAddress(p.recipient) : null;

  const dot = STATUS_DOT[p.status ?? "draft"] ?? "bg-ink-subtle";
  const label = STATUS_TEXT[p.status ?? ""] ?? p.status ?? "—";

  return (
    <div className="relative rounded-xl border border-border/60 bg-surface p-4 transition-colors active:bg-surface-2">
      <Link
        href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
        className="absolute inset-0 rounded-xl"
        aria-label={`View proposal #${p.transactionIndex}`}
      />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-ink-subtle">
              #{p.transactionIndex}
            </span>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span className="text-xs font-medium text-ink-muted">{label}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <KindIcon type={p.type} />
            {KIND_LABEL[p.type]}
          </div>
          <p className="mt-1 text-sm font-medium text-ink">{description}</p>
          {recipient && (
            <p className="mt-0.5 font-mono text-xs text-ink-subtle">{recipient}</p>
          )}
          {p.approvals != null && p.threshold != null && (
            <div className="mt-2">
              <ApprovalDots approvals={p.approvals} threshold={p.threshold} />
            </div>
          )}
        </div>
        <div className="relative z-20 flex shrink-0 flex-col items-end gap-2">
          <Link
            href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-raise-1"
          >
            {p.status === "active" ? "Sign" : p.status === "approved" ? "Execute" : "View"}
          </Link>
          {(p.status === "active" || p.status === "approved") && onCancel && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel(p); }}
              disabled={cancelling}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-signal-danger/30 bg-signal-danger/10 text-signal-danger disabled:opacity-30"
            >
              {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProposalMobileCard({
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
        : p.title || p.memo || "Configuration change";

  const dot = STATUS_DOT[p.status ?? "draft"] ?? "bg-ink-subtle";
  const label = STATUS_TEXT[p.status ?? ""] ?? p.status ?? "—";

  return (
    <div className="relative rounded-xl border border-border/60 bg-surface p-4 transition-colors active:bg-surface-2">
      <Link
        href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
        className="absolute inset-0 rounded-xl"
        aria-label={`View proposal #${p.transactionIndex}`}
      />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-ink-subtle">
              #{p.transactionIndex}
            </span>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span className="text-xs font-medium text-ink-muted">{label}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <KindIcon type={p.type} />
            {KIND_LABEL[p.type]}
          </div>
          <p className="mt-1 text-sm text-ink">{description}</p>
          {p.memo && p.type !== "single" && (
            <p className="mt-0.5 truncate text-xs text-ink-subtle">{p.memo}</p>
          )}
          {p.approvals != null && p.threshold != null && (
            <div className="mt-2">
              <ApprovalDots approvals={p.approvals} threshold={p.threshold} />
            </div>
          )}
        </div>
        <div className="relative z-20 flex shrink-0 flex-col items-end gap-2">
          {!isHistory && (p.status === "active" || p.status === "approved") && onCancel && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel(p); }}
              disabled={cancelling}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-signal-danger/30 bg-signal-danger/10 text-signal-danger disabled:opacity-30"
            >
              {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            </button>
          )}
          {isHistory && onHide && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onHide(p.id); }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-3 hover:text-ink"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          )}
          <Link
            href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-raise-1"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  );
}

function IncomeMobileCard({ entry }: { entry: IncomeEntry }) {
  const solAmount = lamportsToSol(entry.amountLamports);
  const explorerUrl = `https://solscan.io/tx/${entry.signature}${CLUSTER}`;

  return (
    <div className="relative rounded-xl border border-border/60 bg-surface p-4 transition-colors active:bg-surface-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal-positive/15">
              <ArrowDownToLine className="h-3 w-3 text-signal-positive" />
            </span>
            <span className="font-mono text-sm font-semibold text-signal-positive tabular-nums">
              +{solAmount} SOL
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-ink-muted">
            {entry.from === "Unknown" ? (
              <span className="text-ink-subtle italic">Unknown sender</span>
            ) : (
              truncateAddress(entry.from)
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted tabular-nums">{formatDate(entry.blockTime)}</p>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
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
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelAction = cancelTarget?.status === "approved" ? "cancel" : "reject";

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
    setCancelError(null);
    try {
      const baseParams = {
        connection,
        wallet: { publicKey: wallet.publicKey, sendTransaction: wallet.sendTransaction },
        multisigPda: multisigAddress,
        transactionIndex: BigInt(cancelTarget.transactionIndex),
      };
      if (cancelTarget.status === "approved") {
        await proposalCancel(baseParams);
      } else {
        await proposalReject(baseParams);
      }
      await queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      setCancelTarget(null);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not remove proposal.");
    } finally {
      setCancelling(false);
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

  const isOperatorOnly = (p: ProposalSummary) => p.hasDraft && p.status === "executed";

  const grouped = useMemo(() => {
    const queue = proposals.filter(
      (p) => (p.status === "active" || p.status === "approved") && !isOperatorOnly(p),
    );
    const history = proposals.filter(
      (p) =>
        (p.status === "executed" || p.status === "rejected" || p.status === "cancelled") &&
        !archivedIds.has(p.id) &&
        !isOperatorOnly(p),
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

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <div className="min-w-[640px]">
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
            ) : activeTab !== "queue" ? (
              !isLoading && grouped[activeTab as Exclude<TabId, "income" | "queue">]?.length > 0 && (
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
            ) : null}

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
            ) : activeTab === "queue" ? (
              (() => {
                const items = grouped.queue;
                return items.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-sm font-medium text-ink-muted">No pending transactions</p>
                    <p className="mt-1 text-xs text-ink-subtle">
                      New proposals will appear here once submitted.
                    </p>
                  </div>
                ) : (
                  <>
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
                    <div className="divide-y divide-border/40">
                      {items.map((p) => (
                        <ProposalQueueRow
                          key={p.id}
                          multisig={multisig}
                          p={p}
                          onCancel={(target: ProposalSummary) => setCancelTarget(target)}
                          cancelling={cancelling && cancelTarget?.id === p.id}
                        />
                      ))}
                    </div>
                  </>
                );
              })()
            ) : (
              (() => {
                const items = grouped[activeTab as Exclude<TabId, "income" | "queue">] ?? [];
                return items.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-sm font-medium text-ink-muted">
                      {activeTab === "history"
                        ? "No history yet"
                        : "No drafts saved"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {items.map((p) => (
                      <ProposalRow
                        key={p.id}
                        multisig={multisig}
                        p={p}
                        isHistory={activeTab === "history"}
                        {...(activeTab === "history" ? { onHide: hideProposal } : { onCancel: (target: ProposalSummary) => setCancelTarget(target) })}
                        cancelling={cancelling && cancelTarget?.id === p.id}
                      />
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden p-3 space-y-3">
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
              incomeEntries.map((entry) => (
                <IncomeMobileCard key={entry.signature} entry={entry} />
              ))
            )
          ) : activeTab === "queue" ? (
            grouped.queue.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-ink-muted">No pending transactions</p>
                <p className="mt-1 text-xs text-ink-subtle">
                  New proposals will appear here once submitted.
                </p>
              </div>
            ) : (
              grouped.queue.map((p) => (
                <ProposalQueueMobileCard
                  key={p.id}
                  multisig={multisig}
                  p={p}
                  onCancel={(target: ProposalSummary) => setCancelTarget(target)}
                  cancelling={cancelling && cancelTarget?.id === p.id}
                />
              ))
            )
          ) : (
            (() => {
              const items = grouped[activeTab as Exclude<TabId, "income" | "queue">] ?? [];
              return items.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-ink-muted">
                    {activeTab === "history"
                      ? "No history yet"
                      : "No drafts saved"}
                  </p>
                </div>
              ) : (
                items.map((p) => (
                  <ProposalMobileCard
                    key={p.id}
                    multisig={multisig}
                    p={p}
                    isHistory={activeTab === "history"}
                    {...(activeTab === "history" ? { onHide: hideProposal } : { onCancel: (target: ProposalSummary) => setCancelTarget(target) })}
                    cancelling={cancelling && cancelTarget?.id === p.id}
                  />
                ))
              );
            })()
          )}
        </div>
      </div>

      <ConfirmModal
        open={cancelTarget !== null}
        title={cancelAction === "cancel" ? "Cancel proposal" : "Reject proposal"}
        description={
          cancelAction === "cancel"
            ? `Cancel proposal #${cancelTarget?.transactionIndex}? This will void the approved proposal before execution. This action cannot be undone.`
            : `Reject proposal #${cancelTarget?.transactionIndex}? Your rejection vote will be recorded on-chain and cannot be undone.`
        }
        confirmText={cancelAction === "cancel" ? "Cancel proposal" : "Reject proposal"}
        confirmVariant="destructive"
        isLoading={cancelling}
        onConfirm={() => void confirmCancel()}
        onCancel={() => { if (!cancelling) { setCancelTarget(null); setCancelError(null); } }}
      />
      {cancelError && (
        <p className="mt-2 rounded-md border border-signal-danger/30 bg-signal-danger/15 px-3 py-2 text-sm text-signal-danger">
          {cancelError}
        </p>
      )}
    </div>
  );
}

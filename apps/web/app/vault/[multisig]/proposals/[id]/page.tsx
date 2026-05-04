"use client";

import { ApprovalButtons } from "@/components/proposal/ApprovalButtons";
import type { CommitmentCheckState } from "@/components/proposal/CommitmentCheck";
import { ExecuteButton } from "@/components/proposal/ExecuteButton";
import { useToast } from "@/components/ui/toast-provider";
import { InlineAlert } from "@/components/ui/workspace";
import { type ProposalStatusKind, readProposalStatus } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { proposalCancel, proposalReject } from "@/lib/squads-sdk";
import { detectTransactionType } from "@/lib/squads-sdk";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import type { CommitmentClaim } from "@cloak-squads/core/commitment";
import { type MemberVote, getMemberVote } from "@cloak-squads/core/proposal-vote";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

type ProposalDraft = {
  amount: string;
  recipient: string;
  memo: string;
  payloadHash: number[];
  invariants: { commitment: number[] };
};

type PayrollRecipient = {
  id: string;
  name: string;
  wallet: string;
  amount: string;
  memo?: string;
  payloadHash: number[];
  invariants: { commitment: number[] };
};

type PayrollDraft = {
  totalAmount: string;
  recipientCount: number;
  memo?: string;
  recipients: PayrollRecipient[];
};

const STATUS_CONFIG: Record<
  ProposalStatusKind | "unknown",
  { dot: string; bg: string; text: string; label: string }
> = {
  draft: { dot: "bg-ink-subtle", bg: "bg-surface-2", text: "text-ink-muted", label: "Draft" },
  active: {
    dot: "bg-signal-warn animate-pulse",
    bg: "bg-signal-warn/10",
    text: "text-signal-warn",
    label: "Awaiting",
  },
  approved: { dot: "bg-accent", bg: "bg-accent-soft", text: "text-accent", label: "Ready" },
  executing: {
    dot: "bg-signal-warn animate-pulse",
    bg: "bg-signal-warn/10",
    text: "text-signal-warn",
    label: "Executing",
  },
  executed: {
    dot: "bg-signal-positive",
    bg: "bg-signal-positive/10",
    text: "text-signal-positive",
    label: "Executed",
  },
  rejected: {
    dot: "bg-signal-danger",
    bg: "bg-signal-danger/15",
    text: "text-signal-danger",
    label: "Rejected",
  },
  cancelled: {
    dot: "bg-signal-danger",
    bg: "bg-signal-danger/15",
    text: "text-signal-danger",
    label: "Cancelled",
  },
  unknown: { dot: "bg-ink-subtle", bg: "bg-surface-2", text: "text-ink-muted", label: "Unknown" },
};

function StatusBadge({ status }: { status: ProposalStatusKind | "unknown" }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ApprovalBar({ approvals, threshold }: { approvals: number; threshold: number | null }) {
  if (threshold === null) return null;
  const pct = Math.min(100, (approvals / threshold) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-2xl font-bold tabular-nums text-ink">
          {approvals}
          <span className="text-base font-medium text-ink-muted">/{threshold}</span>
        </span>
        <span className="text-xs text-ink-muted">approvals required</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {approvals < threshold && (
        <p className="text-xs text-ink-subtle">
          {threshold - approvals} more approval{threshold - approvals !== 1 ? "s" : ""} needed
        </p>
      )}
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 font-mono text-xs text-ink-muted transition-colors hover:text-ink"
    >
      <span>
        {address.slice(0, 8)}…{address.slice(-8)}
      </span>
      <Copy className={`h-3 w-3 shrink-0 ${copied ? "text-accent" : ""}`} />
    </button>
  );
}

function MemberVoteGrid({
  members,
  approvedVoters,
  rejectedVoters,
}: {
  members: string[];
  approvedVoters: string[];
  rejectedVoters: string[];
}) {
  if (members.length === 0) return null;
  const approvedSet = new Set(approvedVoters);
  const rejectedSet = new Set(rejectedVoters);

  return (
    <div className="mt-4 border-t border-border/50 pt-4">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
        Members
      </p>
      <div className="flex flex-col gap-2">
        {members.map((addr) => {
          const vote = approvedSet.has(addr)
            ? "approved"
            : rejectedSet.has(addr)
              ? "rejected"
              : "pending";
          return (
            <div key={addr} className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-ink-muted">
                {addr.slice(0, 6)}…{addr.slice(-4)}
              </span>
              {vote === "approved" && (
                <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                  <CheckCircle2 className="h-3 w-3" /> Approved
                </span>
              )}
              {vote === "rejected" && (
                <span className="flex items-center gap-1 rounded-full bg-signal-danger/10 px-2 py-0.5 text-[10px] font-semibold text-signal-danger">
                  <XCircle className="h-3 w-3" /> Rejected
                </span>
              )}
              {vote === "pending" && (
                <span className="flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
                  <Circle className="h-3 w-3" /> Pending
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProposalApprovalPage({
  params,
}: {
  params: Promise<{ multisig: string; id: string }>;
}) {
  const { multisig: multisigParam, id } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [commitmentState] = useState<CommitmentCheckState>("checking");
  const [signature, setSignature] = useState<string | null>(null);
  const [executeSignature, setExecuteSignature] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [payrollDraft, setPayrollDraft] = useState<PayrollDraft | null>(null);
  const [commitmentClaim, setCommitmentClaim] = useState<CommitmentClaim | null>(null);
  const [, setCommitmentClaims] = useState<Map<string, CommitmentClaim>>(new Map());
  const [status, setStatus] = useState<ProposalStatusKind | "loading" | "missing">("loading");
  const [approvals, setApprovals] = useState<number>(0);
  const [approvedVoters, setApprovedVoters] = useState<string[]>([]);
  const [rejectedVoters, setRejectedVoters] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [memberVote, setMemberVote] = useState<MemberVote>(null);
  const [transactionType, setTransactionType] = useState<"config" | "vault" | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`claim:${multisigParam}:${id}`);
      if (raw) setCommitmentClaim(JSON.parse(raw) as CommitmentClaim);
      const payrollClaims = new Map<string, CommitmentClaim>();
      for (let i = 0; i < 10; i++) {
        const rawPayroll = sessionStorage.getItem(`claim:${multisigParam}:${id}:${i}`);
        if (rawPayroll) payrollClaims.set(i.toString(), JSON.parse(rawPayroll) as CommitmentClaim);
      }
      if (payrollClaims.size > 0) setCommitmentClaims(payrollClaims);
    } catch {
      /* ignore */
    }
  }, [multisigParam, id]);

  useEffect(() => {
    let cancelled = false;
    setDraftLoading(true);
    async function loadDraft() {
      const singleResponse = await fetchWithAuth(
        `/api/proposals/${encodeURIComponent(multisigParam)}/${encodeURIComponent(id)}?includeSensitive=true`,
      );
      if (singleResponse.ok) {
        if (!cancelled) {
          setDraft((await singleResponse.json()) as ProposalDraft);
          setDraftLoading(false);
        }
        return;
      }
      const payrollResponse = await fetchWithAuth(
        `/api/payrolls/${encodeURIComponent(multisigParam)}/${encodeURIComponent(id)}?includeSensitive=true`,
      );
      if (payrollResponse.ok) {
        if (!cancelled) {
          setPayrollDraft((await payrollResponse.json()) as PayrollDraft);
          setDraftLoading(false);
        }
        return;
      }
      if (!cancelled) {
        setDraft(null);
        setPayrollDraft(null);
        setDraftLoading(false);
      }
    }
    loadDraft().catch((error: unknown) => {
      console.warn("[proposals] could not load draft:", error);
      if (!cancelled) {
        setDraft(null);
        setPayrollDraft(null);
        setDraftLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth, multisigParam, id]);

  const refreshStatus = useCallback(async () => {
    try {
      const multisigPda = new PublicKey(multisigParam);
      const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex: BigInt(id) });
      const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
      setStatus(readProposalStatus(proposal.status));
      setApprovals(proposal.approved.length);
      setApprovedVoters(proposal.approved.map((k: PublicKey) => k.toBase58()));
      setRejectedVoters((proposal.rejected ?? []).map((k: PublicKey) => k.toBase58()));
      setMemberVote(getMemberVote(proposal, wallet.publicKey?.toBase58()));
      if (threshold === null) {
        try {
          const msAccount = await multisig.accounts.Multisig.fromAccountAddress(
            connection,
            multisigPda,
          );
          setThreshold(msAccount.threshold);
          setMembers(msAccount.members.map((m: { key: PublicKey }) => m.key.toBase58()));
        } catch {
          /* threshold unavailable */
        }
      }
      // Detect transaction type (config vs vault) from on-chain account.
      const detected = await detectTransactionType(connection, multisigPda, BigInt(id));
      if (detected) setTransactionType(detected);
    } catch (err) {
      console.warn("[proposals] could not load proposal status:", err);
      setStatus("missing");
      setMemberVote(null);
    }
  }, [connection, multisigParam, id, threshold, wallet.publicKey]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (["executed", "cancelled", "rejected", "missing"].includes(status as string)) return;
    const interval = setInterval(() => void refreshStatus(), 3000);
    return () => clearInterval(interval);
  }, [status, refreshStatus]);

  const onVoteSubmitted = useCallback(
    (sig: string, kind: "approve" | "reject") => {
      setSignature(sig);
      setMemberVote(kind === "approve" ? "approved" : "rejected");
      setTimeout(() => void refreshStatus(), 1500);
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisigParam) });
    },
    [refreshStatus, queryClient, multisigParam],
  );

  const onExecuteSubmitted = useCallback(
    (sig: string) => {
      setExecuteSignature(sig);
      setTimeout(() => void refreshStatus(), 1500);
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisigParam) });
    },
    [refreshStatus, queryClient, multisigParam],
  );

  const handleCancel = useCallback(async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const baseParams = {
        connection,
        wallet: { publicKey: wallet.publicKey, sendTransaction: wallet.sendTransaction },
        multisigPda: new PublicKey(multisigParam),
        transactionIndex: BigInt(id),
      };
      if (status === "approved") {
        await proposalCancel(baseParams);
      } else {
        await proposalReject(baseParams);
      }
      addToast(
        status === "approved" ? "Proposal cancelled." : "Rejection vote submitted.",
        "info",
        3000,
      );
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisigParam) });
      setTimeout(() => void refreshStatus(), 1000);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not remove proposal.");
    } finally {
      setCancelling(false);
    }
  }, [connection, wallet, multisigParam, id, status, refreshStatus, addToast, queryClient]);

  const approveBlocked =
    (commitmentClaim !== null && commitmentState === "mismatch") || status !== "active";
  const executeBlocked = status !== "approved";
  const executeComplete = status === "executed" || executeSignature !== null;
  const isPayroll = payrollDraft !== null;

  const displayStatus = status === "loading" || status === "missing" ? "unknown" : status;

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
        {/* Back + breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-ink-muted">
          <Link
            href={`/vault/${multisigParam}/proposals`}
            className="flex items-center gap-1 transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Transactions
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" />
          <span className="font-mono text-ink">#{id}</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-ink">
                {isPayroll ? "Payroll batch" : "Transfer"} #{id}
              </h1>
              <StatusBadge status={displayStatus} />
            </div>
            {memberVote && (
              <p className="mt-1 text-xs text-ink-muted">
                Your vote: <span className="font-semibold capitalize text-ink">{memberVote}</span>
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Left column — details */}
          <div className="space-y-4 lg:col-span-3">
            {/* Transfer details */}
            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-raise-1">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">
                  {isPayroll ? "Payroll recipients" : "Transfer details"}
                </h2>
              </div>

              <div className="p-5">
                {isPayroll ? (
                  payrollDraft ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="pb-3 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                              Name
                            </th>
                            <th className="pb-3 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                              Wallet
                            </th>
                            <th className="pb-3 pr-4 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                              Amount
                            </th>
                            <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                              Memo
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {payrollDraft.recipients.map((r) => (
                            <tr key={r.id} className="group">
                              <td className="py-3 pr-4 font-medium text-ink">{r.name}</td>
                              <td className="py-3 pr-4">
                                <CopyAddress address={r.wallet} />
                              </td>
                              <td className="py-3 pr-4 text-right font-mono tabular-nums text-ink">
                                {lamportsToSol(r.amount)}{" "}
                                <span className="text-ink-muted">SOL</span>
                              </td>
                              <td className="py-3 text-ink-subtle">{r.memo || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border-strong">
                            <td colSpan={2} className="pt-3 font-semibold text-ink">
                              Total
                            </td>
                            <td className="pt-3 text-right font-mono font-semibold tabular-nums text-ink">
                              {lamportsToSol(payrollDraft.totalAmount)}{" "}
                              <span className="text-ink-muted">SOL</span>
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : draftLoading ? (
                    <div className="flex items-center gap-3 py-6 text-ink-muted">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
                      <span className="text-sm">Loading payroll data…</span>
                    </div>
                  ) : (
                    <InlineAlert>No persisted payroll draft found for this proposal.</InlineAlert>
                  )
                ) : draft ? (
                  <dl className="space-y-4">
                    <div className="flex items-start justify-between">
                      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                        Amount
                      </dt>
                      <dd className="font-mono text-lg font-bold tabular-nums text-ink">
                        {lamportsToSol(draft.amount)}{" "}
                        <span className="text-sm font-medium text-ink-muted">SOL</span>
                      </dd>
                    </div>
                    <div className="border-t border-border/50 pt-4">
                      <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                        Recipient
                      </dt>
                      <dd className="break-all font-mono text-sm text-ink">{draft.recipient}</dd>
                    </div>
                    {draft.memo && (
                      <div className="border-t border-border/50 pt-4">
                        <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                          Memo
                        </dt>
                        <dd className="text-sm text-ink">{draft.memo}</dd>
                      </div>
                    )}
                  </dl>
                ) : draftLoading ? (
                  <div className="flex items-center gap-3 py-6 text-ink-muted">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
                    <span className="text-sm">Loading proposal data…</span>
                  </div>
                ) : (
                  <InlineAlert>
                    No persisted proposal draft found for this proposal index.
                  </InlineAlert>
                )}
              </div>
            </div>

            {/* Technical details */}
            <details className="group overflow-hidden rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-sm text-ink-muted transition-colors hover:text-ink">
                <span className="font-medium">Technical details</span>
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t border-border px-5 pb-5 pt-4">
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                      Multisig
                    </dt>
                    <dd>
                      <CopyAddress address={multisigParam} />
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                      Transaction index
                    </dt>
                    <dd className="font-mono text-xs text-ink-muted">#{id}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                      Type
                    </dt>
                    <dd className="text-ink-muted">
                      {isPayroll ? "Payroll batch" : "Private send"}
                    </dd>
                  </div>
                </dl>
              </div>
            </details>
          </div>

          {/* Right column — approvals + actions */}
          <div className="space-y-4 lg:col-span-2">
            {/* Approvals */}
            <div className="rounded-xl border border-border bg-surface p-5 shadow-raise-1">
              <h2 className="mb-4 text-sm font-semibold text-ink">Approvals</h2>
              <ApprovalBar approvals={approvals} threshold={threshold} />
              <MemberVoteGrid
                members={members}
                approvedVoters={approvedVoters}
                rejectedVoters={rejectedVoters}
              />
            </div>

            {/* Vote */}
            <div className="rounded-xl border border-border bg-surface p-5 shadow-raise-1">
              <h2 className="mb-4 text-sm font-semibold text-ink">Your vote</h2>
              {memberVote ? (
                <div
                  className={`flex items-center gap-2.5 rounded-lg px-3.5 py-3 ${memberVote === "approved" ? "bg-accent-soft" : "bg-signal-danger/10"}`}
                >
                  {memberVote === "approved" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-signal-danger" />
                  )}
                  <div>
                    <p
                      className={`text-sm font-semibold ${memberVote === "approved" ? "text-accent" : "text-signal-danger"}`}
                    >
                      You{" "}
                      {memberVote === "approved"
                        ? "approved"
                        : memberVote === "rejected"
                          ? "rejected"
                          : "cancelled"}{" "}
                      this proposal
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      One vote per member is recorded on-chain.
                    </p>
                  </div>
                </div>
              ) : (
                <ApprovalButtons
                  multisig={multisigParam}
                  transactionIndex={id}
                  disabled={approveBlocked}
                  onSubmitted={onVoteSubmitted}
                />
              )}
              {signature && (
                <p className="mt-3 break-all rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 font-mono text-xs text-accent">
                  {signature}
                </p>
              )}
            </div>

            {/* Execute */}
            <div className="rounded-xl border border-border bg-surface p-5 shadow-raise-1">
              <h2 className="mb-4 text-sm font-semibold text-ink">Execute</h2>
              {executeComplete ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 rounded-lg bg-accent-soft px-3.5 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div>
                      <p className="text-sm font-semibold text-accent">Transaction executed</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        The Squads proposal is complete.
                      </p>
                      {executeSignature && (
                        <p className="mt-2 break-all rounded-md border border-accent/20 bg-bg/40 px-2.5 py-1.5 font-mono text-[10px] text-ink-muted">
                          {executeSignature}
                        </p>
                      )}
                    </div>
                  </div>
                  {transactionType !== "config" && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-signal-warn/25 bg-signal-warn/10 px-3.5 py-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-signal-warn" />
                      <div>
                        <p className="text-sm font-semibold text-ink">Waiting for Operator</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          The Operator must now execute the private delivery so the SOL is sent to
                          the recipient.
                        </p>
                        <Link
                          href={`/vault/${multisigParam}/operator?proposal=${encodeURIComponent(id)}`}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-raise-1 transition-opacity hover:opacity-90"
                        >
                          Go to Operator
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <ExecuteButton
                      multisig={multisigParam}
                      transactionIndex={id}
                      onSubmitted={onExecuteSubmitted}
                      disabled={executeBlocked}
                      requireCofreInitialized={draft !== null || payrollDraft !== null}
                      transactionType={transactionType ?? "vault"}
                    />
                    {(status === "active" || status === "approved") && (
                      <button
                        type="button"
                        onClick={() => void handleCancel()}
                        disabled={cancelling}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {cancelling ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <X className="mr-2 h-4 w-4" />
                        )}
                        {cancelling
                          ? status === "approved"
                            ? "Cancelling…"
                            : "Rejecting…"
                          : status === "approved"
                            ? "Cancel proposal"
                            : "Reject proposal"}
                      </button>
                    )}
                  </div>
                  {!executeComplete && executeBlocked && status !== "loading" && (
                    <p className="text-xs text-ink-subtle">
                      {status === "active" && threshold !== null
                        ? `Needs ${Math.max(0, threshold - approvals)} more approval${Math.max(0, threshold - approvals) !== 1 ? "s" : ""}.`
                        : `Execute requires approved status. Current: ${status}.`}
                    </p>
                  )}
                  {cancelError && (
                    <p className="rounded-md border border-signal-danger/30 bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
                      {cancelError}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Timeline — compact */}
            <div className="rounded-xl border border-border bg-surface shadow-raise-1">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Timeline</h2>
              </div>
              <ol className="divide-y divide-border/50">
                {[
                  {
                    label: "Draft loaded",
                    done: draft !== null || payrollDraft !== null,
                    current: false,
                  },
                  {
                    label: "Proposal opened",
                    done: status !== "loading" && status !== "missing",
                    current: false,
                  },
                  {
                    label: "Votes collected",
                    done: approvals > 0,
                    current: status === "active" && !(threshold !== null && approvals >= threshold),
                    detail: threshold !== null ? `${approvals}/${threshold}` : `${approvals}`,
                  },
                  {
                    label: "Threshold reached",
                    done:
                      status === "approved" ||
                      (status === "active" && threshold !== null && approvals >= threshold) ||
                      executeComplete,
                    current:
                      (status === "approved" ||
                        (status === "active" && threshold !== null && approvals >= threshold)) &&
                      !executeComplete,
                  },
                  {
                    label: "Executed",
                    done: executeComplete,
                    current: false,
                  },
                ].map((step) => (
                  <li key={step.label} className="flex items-center gap-3 px-5 py-3">
                    {step.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : (
                      <Circle
                        className={`h-3.5 w-3.5 shrink-0 ${step.current ? "text-signal-warn" : "text-border-strong"}`}
                      />
                    )}
                    <span
                      className={`text-sm ${step.done ? "text-ink" : step.current ? "text-signal-warn" : "text-ink-subtle"}`}
                    >
                      {step.label}
                    </span>
                    {step.detail && (
                      <span className="ml-auto text-xs font-mono text-ink-muted">
                        {step.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { ApprovalButtons } from "@/components/proposal/ApprovalButtons";
import type { CommitmentCheckState } from "@/components/proposal/CommitmentCheck";
import { ExecuteButton } from "@/components/proposal/ExecuteButton";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { ReceiptRow } from "@/components/ui/receipt-row";
import { useToast } from "@/components/ui/toast-provider";
import { InlineAlert } from "@/components/ui/workspace";
import { isProposalExecuted } from "@/lib/operator-execution-history";
import { type ProposalStatusKind, readProposalStatus } from "@/lib/proposals";
import { proposalCancel, proposalReject } from "@/lib/squads-sdk";
import { detectTransactionType } from "@/lib/squads-sdk";
import { SOL_MINT, formatRawAmount } from "@/lib/tokens";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import type { CommitmentClaim } from "@cloak-squads/core/commitment";
import { type MemberVote, getMemberVote } from "@cloak-squads/core/proposal-vote";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  Hash,
  Key,
  Loader2,
  Lock,
  Repeat,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

type ProposalDraft = {
  // "private" — Cloak shielded send (default for back-compat)
  // "public"  — plain Squads transfer; payloadHash + invariants.{commitment,...} are absent
  kind?: "private" | "public";
  amount: string;
  recipient: string;
  memo: string;
  payloadHash: number[] | null;
  invariants: { commitment?: number[]; tokenMint?: string } | null;
  // Member-tier (default GET) returns this with public fields only;
  // operator-tier GET (?includeSensitive=true) adds keypairPrivateKey/blinding.
  commitmentClaim?: CommitmentClaim;
};

type SwapDraft = {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  inputSymbol: string;
  outputSymbol: string;
  memo?: string;
};

type PayrollRecipient = {
  id: string;
  name: string;
  wallet: string;
  amount: string;
  memo?: string;
  payloadHash: number[];
  invariants: { commitment: number[]; tokenMint?: string };
  commitmentClaim?: CommitmentClaim;
};

type PayrollDraft = {
  totalAmount: string;
  recipientCount: number;
  memo?: string;
  recipients: PayrollRecipient[];
};

const STATUS_CONFIG: Record<
  ProposalStatusKind | "unknown" | "locked",
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
  locked: {
    dot: "bg-signal-warn",
    bg: "bg-signal-warn/10",
    text: "text-signal-warn",
    label: "Locked",
  },
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

function StatusBadge({ status }: { status: ProposalStatusKind | "unknown" | "locked" }) {
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
      className="flex items-center gap-1.5 font-mono text-xs text-ink-muted transition-aegis hover:text-ink"
    >
      <span>
        {address.slice(0, 8)}…{address.slice(-8)}
      </span>
      <Copy className={`h-3 w-3 shrink-0 ${copied ? "text-accent" : ""}`} />
    </button>
  );
}

type MemberRowVote = "approved" | "pending" | "rejected";

const VOTE_CHIP: Record<
  MemberRowVote,
  { icon: typeof CheckCircle2; label: string; cls: string }
> = {
  approved: {
    icon: CheckCircle2,
    label: "Approved",
    cls: "bg-accent-soft text-accent",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    cls: "bg-signal-danger/10 text-signal-danger",
  },
  pending: {
    icon: Circle,
    label: "Pending",
    cls: "bg-surface-3 text-ink-subtle",
  },
};

function VoteChip({ vote }: { vote: MemberRowVote }) {
  const cfg = VOTE_CHIP[vote];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

const RECEIPT_SKELETON_ROWS: ReadonlyArray<{ lw: string; vw: string }> = [
  { lw: "56px", vw: "120px" },
  { lw: "76px", vw: "180px" },
  { lw: "48px", vw: "100px" },
  { lw: "62px", vw: "140px" },
];

function ReceiptSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-1" aria-busy="true" aria-label={label}>
      {RECEIPT_SKELETON_ROWS.map((row, i) => (
        <div key={i} className="receipt-row">
          <span
            className="block h-3 animate-pulse rounded-full bg-surface-2"
            style={{ width: row.lw }}
          />
          <span className="leader" aria-hidden="true" />
          <span
            className="block h-3 animate-pulse rounded-full bg-surface-2"
            style={{ width: row.vw }}
          />
        </div>
      ))}
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
  const [draftError, setDraftError] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [payrollDraft, setPayrollDraft] = useState<PayrollDraft | null>(null);
  const [swapDraft, setSwapDraft] = useState<SwapDraft | null>(null);
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
  const [sourceVaultIndex, setSourceVaultIndex] = useState<number | null>(null);
  const [subVaultAccounts, setSubVaultAccounts] = useState<
    Array<{ vaultIndex: number; name: string }>
  >([]);
  const [operatorDelivered, setOperatorDelivered] = useState(false);

  useEffect(() => {
    const sync = () => setOperatorDelivered(isProposalExecuted(multisigParam, id));
    sync();
    window.addEventListener("aegis:operator-executed", sync);
    return () => window.removeEventListener("aegis:operator-executed", sync);
  }, [multisigParam, id]);

  useEffect(() => {
    fetch(`/api/vaults/${multisigParam}/sub-vaults`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ vaultIndex: number; name: string }>) => setSubVaultAccounts(data))
      .catch(() => {});
  }, [multisigParam]);

  const sourceVaultName =
    sourceVaultIndex === null || sourceVaultIndex === 0
      ? null
      : (subVaultAccounts.find((sv) => sv.vaultIndex === sourceVaultIndex)?.name ??
        `Vault #${sourceVaultIndex}`);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [approvedAtSec, setApprovedAtSec] = useState<number | null>(null);
  const { data: vaultData } = useVaultData(multisigParam);
  const timeLockSeconds = vaultData?.timeLock ?? 0;

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

  // Co-signer fallback: if sessionStorage doesn't have the proposer's local cache
  // (e.g. a different signer opening this proposal in another browser), use the
  // public claim returned by the API (no secrets, just verifiable invariants).
  useEffect(() => {
    if (commitmentClaim) return;
    if (draft?.commitmentClaim) {
      setCommitmentClaim(draft.commitmentClaim as CommitmentClaim);
      return;
    }
    if (payrollDraft?.recipients?.length) {
      const map = new Map<string, CommitmentClaim>();
      payrollDraft.recipients.forEach((r, i) => {
        if (r.commitmentClaim) map.set(i.toString(), r.commitmentClaim as CommitmentClaim);
      });
      if (map.size > 0) setCommitmentClaims(map);
    }
  }, [commitmentClaim, draft, payrollDraft]);

  const loadDraft = useCallback(async () => {
    const cancelled = false;
    setDraftLoading(true);
    setDraftError(null);
    try {
      // Member-tier fetch: returns commitmentClaim with public invariants
      // (commitment, amount, recipient_vk, token_mint, keypairPublicKey) so any
      // co-signer can verify what they're approving — but WITHOUT secrets
      // (keypairPrivateKey, blinding) which only the operator needs to execute.
      const [singleResponse, payrollResponse, swapResponse] = await Promise.all([
        fetchWithAuth(
          `/api/proposals/${encodeURIComponent(multisigParam)}/${encodeURIComponent(id)}`,
        ),
        fetchWithAuth(
          `/api/payrolls/${encodeURIComponent(multisigParam)}/${encodeURIComponent(id)}`,
        ),
        fetchWithAuth(`/api/swaps/${encodeURIComponent(multisigParam)}/${encodeURIComponent(id)}`),
      ]);

      if (!cancelled) {
        if (singleResponse.ok) {
          setDraft((await singleResponse.json()) as ProposalDraft);
          setPayrollDraft(null);
          setSwapDraft(null);
        } else if (payrollResponse.ok) {
          setPayrollDraft((await payrollResponse.json()) as PayrollDraft);
          setDraft(null);
          setSwapDraft(null);
        } else if (swapResponse.ok) {
          setSwapDraft((await swapResponse.json()) as SwapDraft);
          setDraft(null);
          setPayrollDraft(null);
        } else {
          setDraft(null);
          setPayrollDraft(null);
          setSwapDraft(null);
          const anyUnavailable = [singleResponse, payrollResponse, swapResponse].some(
            (r) => r.status === 503,
          );
          setDraftError(anyUnavailable ? 503 : singleResponse.status);
        }
        setDraftLoading(false);
      }
    } catch (error: unknown) {
      console.warn("[proposals] could not load draft:", error);
      if (!cancelled) {
        setDraft(null);
        setPayrollDraft(null);
        setSwapDraft(null);
        setDraftError(0);
        setDraftLoading(false);
      }
    }
  }, [fetchWithAuth, multisigParam, id]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  const refreshStatus = useCallback(async () => {
    try {
      const multisigPda = new PublicKey(multisigParam);
      const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex: BigInt(id) });
      const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
      const statusKind = readProposalStatus(proposal.status);
      setStatus(statusKind);
      setApprovals(proposal.approved.length);
      setApprovedVoters(proposal.approved.map((k: PublicKey) => k.toBase58()));
      setRejectedVoters((proposal.rejected ?? []).map((k: PublicKey) => k.toBase58()));
      setMemberVote(getMemberVote(proposal, wallet.publicKey?.toBase58()));

      // Capture the Approved-state timestamp so we can compute when the time
      // lock expires. The Squads program stamps unix seconds (bignum) on every
      // status transition; we only care about Approved here.
      if (statusKind === "approved") {
        const ts = (proposal.status as { timestamp?: { toString: () => string } }).timestamp;
        if (ts) {
          const seconds = Number(ts.toString());
          if (Number.isFinite(seconds)) setApprovedAtSec(seconds);
        }
      } else {
        setApprovedAtSec(null);
      }
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

      // Read the source vault index for VaultTransactions so the UI can show
      // which sub-vault the proposal will spend from.
      if (detected === "vault") {
        try {
          const [transactionPda] = multisig.getTransactionPda({
            multisigPda,
            index: BigInt(id),
          });
          const vaultTx = await multisig.accounts.VaultTransaction.fromAccountAddress(
            connection,
            transactionPda,
          );
          setSourceVaultIndex(vaultTx.vaultIndex);
        } catch {
          /* vault transaction account unavailable */
        }
      }
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

  const unlocksAtMs =
    approvedAtSec !== null && timeLockSeconds > 0 ? (approvedAtSec + timeLockSeconds) * 1000 : null;
  const [, forceTimeLockTick] = useState(0);
  // Re-evaluate isLocked once the lock should expire so the Execute button
  // enables without waiting for the next 3s status poll.
  useEffect(() => {
    if (unlocksAtMs === null) return;
    const remaining = unlocksAtMs - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => forceTimeLockTick((n) => n + 1), remaining + 100);
    return () => clearTimeout(id);
  }, [unlocksAtMs]);
  const isLocked = unlocksAtMs !== null && unlocksAtMs > Date.now();
  const approveBlocked =
    (commitmentClaim !== null && commitmentState === "mismatch") || status !== "active";
  const executeBlocked = status !== "approved" || isLocked;
  const executeComplete = status === "executed" || executeSignature !== null;
  const isPayroll = payrollDraft !== null;
  const isSwap = swapDraft !== null;

  const displayStatus: ProposalStatusKind | "unknown" | "locked" =
    status === "loading" || status === "missing"
      ? "unknown"
      : isLocked && status === "approved"
        ? "locked"
        : status;

  const kindMeta: { icon: LucideIcon; title: string; subline: string } = (() => {
    if (isPayroll && payrollDraft) {
      const tokenMint = payrollDraft.recipients[0]?.invariants.tokenMint ?? SOL_MINT;
      const count = payrollDraft.recipients.length;
      return {
        icon: Users,
        title: "Payroll batch",
        subline: `${count} recipient${count !== 1 ? "s" : ""} · ${formatRawAmount(payrollDraft.totalAmount, tokenMint)} total`,
      };
    }
    if (isSwap && swapDraft) {
      return {
        icon: Repeat,
        title: "Token swap",
        subline: `${formatRawAmount(swapDraft.inputAmount, swapDraft.inputMint)} → ${formatRawAmount(swapDraft.outputAmount, swapDraft.outputMint)} (est.)`,
      };
    }
    if (transactionType === "config") {
      return {
        icon: Settings,
        title: "Vault configuration",
        subline: "Updates settings, members, or threshold.",
      };
    }
    if (draft) {
      const formatted = formatRawAmount(draft.amount, draft.invariants?.tokenMint ?? SOL_MINT);
      const shortAddr = `${draft.recipient.slice(0, 6)}…${draft.recipient.slice(-4)}`;
      if (draft.kind === "private") {
        return {
          icon: ShieldCheck,
          title: "Private send",
          subline: `${formatted} → ${shortAddr} · Shielded via Cloak`,
        };
      }
      return {
        icon: Send,
        title: "Public transfer",
        subline: `${formatted} → ${shortAddr}`,
      };
    }
    return {
      icon: Hash,
      title: draftLoading ? "Loading proposal" : "Vault proposal",
      subline: draftLoading
        ? "Fetching on-chain state…"
        : "On-chain transaction. Details may live only on-chain.",
    };
  })();
  const KindIcon = kindMeta.icon;

  // ── Quorum ledger derivation ─────────────────────────────────────
  // Sort members so approvers appear first, then pending, then rejected;
  // tag the connected wallet with a "You" pill.
  const myAddress = wallet.publicKey?.toBase58() ?? null;
  const approvedSet = new Set(approvedVoters);
  const rejectedSet = new Set(rejectedVoters);
  const sortOrder: Record<MemberRowVote, number> = { approved: 0, pending: 1, rejected: 2 };
  const memberRows = members
    .map((addr) => {
      const vote: MemberRowVote = approvedSet.has(addr)
        ? "approved"
        : rejectedSet.has(addr)
          ? "rejected"
          : "pending";
      return {
        addr,
        vote,
        isYou: myAddress === addr,
        initials: addr.slice(0, 2),
        short: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
      };
    })
    .sort((a, b) => sortOrder[a.vote] - sortOrder[b.vote]);
  const quorumPct =
    threshold === null ? 0 : Math.min(100, Math.round((approvals / threshold) * 100));

  // ── Safety strip · "what stage are we on?" ──────────────────────
  // Mirrors Stripe / Apple Pay pre-charge confirmation patterns:
  // a single calm ribbon that names the gate before the action button.
  type SafetyTone = "warn" | "lock" | "ready";
  const safetyState: { tone: SafetyTone; eyebrow: string; body: React.ReactNode } | null = (() => {
    if (executeComplete) return null;
    if (status === "rejected" || status === "cancelled" || status === "missing" || status === "loading") {
      return null;
    }
    if (status === "active") {
      if (threshold !== null && approvals < threshold) {
        const need = threshold - approvals;
        return {
          tone: "warn",
          eyebrow: "Awaiting quorum",
          body: `${need} more approval${need !== 1 ? "s" : ""} before this can execute.`,
        };
      }
      if (threshold !== null && approvals >= threshold) {
        return {
          tone: "ready",
          eyebrow: "Quorum reached",
          body: "Awaiting on-chain confirmation.",
        };
      }
    }
    if (status === "approved") {
      if (isLocked && unlocksAtMs !== null) {
        return {
          tone: "lock",
          eyebrow: "Time lock active",
          body: (
            <>
              Unlocks in <Countdown to={unlocksAtMs} />.
            </>
          ),
        };
      }
      return {
        tone: "ready",
        eyebrow: "All clear",
        body: "Threshold met, time lock cleared. Ready to execute.",
      };
    }
    return null;
  })();
  const safetyClasses: Record<SafetyTone, { wrap: string; chip: string; eyebrow: string }> = {
    warn: {
      wrap: "border-signal-warn/30 bg-signal-warn/5",
      chip: "bg-signal-warn/15 text-signal-warn",
      eyebrow: "text-signal-warn",
    },
    lock: {
      wrap: "border-brass/30 bg-brass/5",
      chip: "bg-brass/20 text-accent",
      eyebrow: "text-accent",
    },
    ready: {
      wrap: "border-accent/30 bg-accent-soft",
      chip: "bg-accent/15 text-accent",
      eyebrow: "text-accent",
    },
  };
  const SafetyIcon: Record<SafetyTone, typeof CheckCircle2> = {
    warn: AlertTriangle,
    lock: Lock,
    ready: CheckCircle2,
  };

  // ── Settled ribbon copy ─────────────────────────────────────────
  const settledTitle = isSwap
    ? "Swap executed"
    : transactionType === "config"
      ? "Configuration applied"
      : isPayroll
        ? "Payroll batch executed"
        : draft?.kind === "private"
          ? "Vault license issued"
          : "Transfer settled";
  const settledHint = isSwap
    ? "Tokens swapped, funds returned to the vault."
    : transactionType === "config"
      ? "Vault settings have been updated."
      : isPayroll
        ? "The Squads proposal is complete."
        : draft?.kind === "private"
          ? "Squads side complete. Operator delivers next."
          : "Funds were sent from the vault.";

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
        {/* Back link — standalone, above the hero */}
        <Link
          href={`/vault/${multisigParam}/proposals`}
          className="text-eyebrow mb-4 inline-flex items-center gap-1.5 text-ink-muted transition-aegis hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Back to transactions
        </Link>

        {/* ── Hero · Identity-locked proposal crest ──
            Mirrors /operator hero pattern: Æ watermark + Fraunces title +
            chip row positions the proposal as a private-bank signing item. */}
        <section className="card-hero relative mb-6">
          <HeraldicWatermark size={320} opacity={0.04} />
          <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-start md:gap-6 md:p-7">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-accent-soft text-accent shadow-raise-1">
              <KindIcon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-eyebrow">Proposal · #{id}</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                {kindMeta.title}
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">{kindMeta.subline}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={displayStatus} />
                {isLocked && unlocksAtMs !== null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-warn/10 px-2.5 py-1 font-mono text-xs text-signal-warn">
                    Unlocks in <Countdown to={unlocksAtMs} />
                  </span>
                )}
                {sourceVaultName && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    From {sourceVaultName}
                  </span>
                )}
                {memberVote && (
                  <span className="text-eyebrow inline-flex items-center gap-1">
                    Your vote ·{" "}
                    <span className="font-semibold capitalize text-ink">{memberVote}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Left column — details */}
          <div className="space-y-4 lg:col-span-3">
            {/* ── Receipt · "what this signs" ──
                Dotted-leader receipt rows (Stripe / Apple Wallet pre-charge
                pattern). Payroll keeps tabular form because it's a list. */}
            <div className="card-panel overflow-hidden">
              <header className="border-b border-border/60 px-5 py-3.5">
                <p className="text-eyebrow">
                  {isPayroll
                    ? `Recipients${payrollDraft ? ` · ${payrollDraft.recipients.length}` : ""}`
                    : "Receipt · what this signs"}
                </p>
              </header>

              <div className="p-5">
                {isPayroll ? (
                  payrollDraft ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="pb-3 pr-4 text-left text-eyebrow">Name</th>
                            <th className="pb-3 pr-4 text-left text-eyebrow">Wallet</th>
                            <th className="pb-3 pr-4 text-right text-eyebrow">Amount</th>
                            <th className="pb-3 text-left text-eyebrow">Memo</th>
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
                                {formatRawAmount(r.amount, r.invariants.tokenMint ?? SOL_MINT)}
                              </td>
                              <td className="py-3 text-ink-subtle">{r.memo || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border-strong">
                            <td colSpan={2} className="pt-3 font-semibold text-ink">
                              Total
                            </td>
                            <td className="pt-3 text-right font-mono font-semibold tabular-nums text-ink">
                              {formatRawAmount(
                                payrollDraft.totalAmount,
                                payrollDraft.recipients[0]?.invariants.tokenMint ?? SOL_MINT,
                              )}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : draftLoading ? (
                    <ReceiptSkeleton label="Loading payroll data" />
                  ) : draftError ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-signal-warn/10">
                        <AlertTriangle className="h-6 w-6 text-signal-warn" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-ink">
                          {draftError === 503
                            ? "Database temporarily unavailable"
                            : "Could not load transfer details"}
                        </p>
                        <p className="max-w-xs text-xs text-ink-muted">
                          {draftError === 503
                            ? "The database is currently unreachable. The proposal details are stored on-chain and can still be executed by signers."
                            : "Something went wrong while fetching the proposal details. You can still vote and execute the proposal."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadDraft()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition-aegis hover:bg-surface-3"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                      </button>
                    </div>
                  ) : (
                    <InlineAlert>No persisted payroll draft found for this proposal.</InlineAlert>
                  )
                ) : swapDraft ? (
                  <div className="space-y-1">
                    <ReceiptRow label="From">
                      {formatRawAmount(swapDraft.inputAmount, swapDraft.inputMint)}
                    </ReceiptRow>
                    <ReceiptRow label="To (est.)">
                      {formatRawAmount(swapDraft.outputAmount, swapDraft.outputMint)}
                    </ReceiptRow>
                    {swapDraft.memo && (
                      <ReceiptRow label="Memo" mono={false} tone="muted">
                        {swapDraft.memo}
                      </ReceiptRow>
                    )}
                  </div>
                ) : draft ? (
                  <div className="space-y-1">
                    <ReceiptRow label="Amount">
                      {formatRawAmount(draft.amount, draft.invariants?.tokenMint ?? SOL_MINT)}
                    </ReceiptRow>
                    <ReceiptRow label="Recipient" mono={false}>
                      <CopyAddress address={draft.recipient} />
                    </ReceiptRow>
                    {draft.memo && (
                      <ReceiptRow label="Memo" mono={false} tone="muted">
                        {draft.memo}
                      </ReceiptRow>
                    )}
                    <ReceiptRow
                      label="Privacy"
                      mono={false}
                      tone={draft.kind === "private" ? "accent" : "muted"}
                    >
                      {draft.kind === "private" ? "Shielded via Cloak" : "Public transfer"}
                    </ReceiptRow>
                  </div>
                ) : draftLoading ? (
                  <ReceiptSkeleton label="Loading proposal data" />
                ) : transactionType === "config" ? (
                  <div className="space-y-1">
                    <ReceiptRow label="Type" mono={false}>
                      Vault configuration
                    </ReceiptRow>
                    <ReceiptRow label="Index">#{id}</ReceiptRow>
                    <p className="mt-3 text-xs text-ink-muted">
                      Configuration proposals update vault settings or the member list. Details are
                      stored on-chain.
                    </p>
                  </div>
                ) : draftError === 503 ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-signal-warn/10">
                      <AlertTriangle className="h-6 w-6 text-signal-warn" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-ink">
                        Database temporarily unavailable
                      </p>
                      <p className="max-w-xs text-xs text-ink-muted">
                        The database is currently unreachable. The proposal details are stored
                        on-chain and can still be executed by signers.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadDraft()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition-aegis hover:bg-surface-3"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </button>
                  </div>
                ) : draftError === 404 || draftError !== null ? (
                  <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-4">
                    <Settings className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                    <div>
                      <p className="text-sm font-semibold text-ink">Vault proposal</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        No off-chain details stored for this proposal. You can still vote and
                        execute it using the on-chain data.
                      </p>
                    </div>
                  </div>
                ) : (
                  <InlineAlert>
                    No persisted proposal draft found for this proposal index.
                  </InlineAlert>
                )}
              </div>
            </div>

            {/* ── Timeline · brass rail ──
                Vertical rail with brass-toned markers. Filled disc = done,
                pulsing ring = current, hollow = pending. Mirrors the heraldic
                signing-stage pattern from the operator page. */}
            {(() => {
              const steps: Array<{
                label: string;
                done: boolean;
                current: boolean;
                detail?: string;
              }> = [
                {
                  label: "Draft loaded",
                  done: draft !== null || payrollDraft !== null || swapDraft !== null,
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
                  current:
                    status === "active" && !(threshold !== null && approvals >= threshold),
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
              ];
              return (
                <div className="card-panel">
                  <header className="border-b border-border/60 px-5 py-3.5">
                    <p className="text-eyebrow">Timeline · {steps.length} stages</p>
                  </header>
                  <ol className="px-5 py-4">
                    {steps.map((step, i) => {
                      const isLast = i === steps.length - 1;
                      return (
                        <li
                          key={step.label}
                          className="relative grid grid-cols-[24px_1fr_auto] items-center gap-3 py-2.5"
                        >
                          {/* connector rail (skipped for last step) */}
                          {!isLast && (
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute left-[11px] top-1/2 h-full w-px ${
                                step.done ? "bg-brass/40" : "bg-border"
                              }`}
                            />
                          )}
                          {/* marker */}
                          <span className="relative z-10 flex justify-center">
                            {step.done ? (
                              <span className="flex h-3 w-3 items-center justify-center rounded-full bg-accent shadow-[0_0_0_4px_hsl(var(--surface))]">
                                <span className="h-1 w-1 rounded-full bg-accent-ink" />
                              </span>
                            ) : step.current ? (
                              <span className="relative flex h-3 w-3 items-center justify-center rounded-full border-2 border-signal-warn bg-surface shadow-[0_0_0_4px_hsl(var(--surface))]">
                                <span className="absolute inset-0 animate-ping rounded-full bg-signal-warn/40" />
                              </span>
                            ) : (
                              <span className="h-3 w-3 rounded-full border-2 border-border-strong bg-surface shadow-[0_0_0_4px_hsl(var(--surface))]" />
                            )}
                          </span>
                          {/* label */}
                          <span
                            className={`text-sm ${
                              step.done
                                ? "text-ink"
                                : step.current
                                  ? "text-signal-warn"
                                  : "text-ink-subtle"
                            }`}
                          >
                            {step.label}
                          </span>
                          {/* detail */}
                          {step.detail && (
                            <span className="font-mono text-xs tabular-nums text-ink-muted">
                              {step.detail}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })()}

            {/* Technical details */}
            <details className="group card-panel overflow-hidden">
              <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-sm text-ink-muted transition-aegis hover:text-ink">
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
                      {isPayroll
                        ? "Payroll batch"
                        : isSwap
                          ? "Token swap"
                          : draft?.kind === "public"
                            ? "Public transfer"
                            : draft?.kind === "private"
                              ? "Private send"
                              : "Vault transaction"}
                    </dd>
                  </div>
                </dl>
              </div>
            </details>
          </div>

          {/* ── Right column · sticky action stack ──
              Master/detail signing console pattern (Stripe / Carbon). The
              column tracks the user as they scroll the receipt + timeline,
              keeping the next action always one glance away. */}
          <aside className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start space-y-4">
            {/* ── Quorum ledger ── */}
            <div className="card-panel p-5">
              <header className="mb-4 flex items-baseline justify-between">
                <p className="text-eyebrow">Quorum · approvals</p>
                {threshold !== null && (
                  <span className="text-xs text-ink-subtle">
                    {quorumPct}% of threshold
                  </span>
                )}
              </header>
              {threshold === null ? (
                <div className="space-y-2.5">
                  <div className="h-7 w-1/3 animate-pulse rounded-md bg-surface-2" />
                  <div className="h-1.5 w-full animate-pulse rounded-full bg-surface-2" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
                      {approvals}
                    </span>
                    <span className="text-base font-medium text-ink-subtle">/ {threshold}</span>
                    <span className="ml-auto text-eyebrow">required</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${quorumPct}%` }}
                    />
                  </div>
                </div>
              )}
              {memberRows.length > 0 && (
                <div className="mt-5 border-t border-border/50 pt-4">
                  <p className="text-eyebrow mb-3">Ledger · {memberRows.length} member{memberRows.length !== 1 ? "s" : ""}</p>
                  <ul className="space-y-2">
                    {memberRows.map((row) => (
                      <li key={row.addr} className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brass/30 bg-surface-2 font-mono text-[10px] font-semibold text-ink-muted"
                        >
                          {row.initials}
                        </span>
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="truncate font-mono text-xs text-ink-muted">
                            {row.short}
                          </span>
                          {row.isYou && (
                            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-eyebrow text-accent">
                              You
                            </span>
                          )}
                        </div>
                        <VoteChip vote={row.vote} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* ── Safety strip · what's blocking the next stage ── */}
            {safetyState &&
              (() => {
                const cls = safetyClasses[safetyState.tone];
                const Icon = SafetyIcon[safetyState.tone];
                return (
                  <div className={`rounded-panel border px-4 py-3.5 ${cls.wrap}`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cls.chip}`}>
                        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className={`text-eyebrow ${cls.eyebrow}`}>{safetyState.eyebrow}</p>
                        <p className="mt-1 text-sm text-ink">{safetyState.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* ── Vote panel · only when the user hasn't voted yet ── */}
            {!memberVote && status === "active" && (
              <div className="card-panel p-5">
                <p className="text-eyebrow mb-3">Your vote</p>
                <ApprovalButtons
                  multisig={multisigParam}
                  transactionIndex={id}
                  disabled={approveBlocked}
                  onSubmitted={onVoteSubmitted}
                />
                {signature && (
                  <p className="mt-3 break-all rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 font-mono text-[10px] text-accent">
                    {signature}
                  </p>
                )}
              </div>
            )}

            {/* ── Action panel · execute or settled ribbon ── */}
            {executeComplete ? (
              <div className="card-panel relative overflow-hidden p-5">
                <HeraldicWatermark size={160} opacity={0.05} />
                <div className="relative">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent shadow-raise-1">
                      <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-eyebrow text-accent">Settled · on chain</p>
                      <p className="mt-1 font-display text-lg font-semibold tracking-tight text-ink">
                        {settledTitle}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">{settledHint}</p>
                    </div>
                  </div>
                  {executeSignature && (
                    <div className="mt-4 rounded-lg border border-border bg-bg/40 px-3 py-2">
                      <p className="text-eyebrow mb-1 text-ink-subtle">Signature</p>
                      <p className="break-all font-mono text-[10px] text-ink-muted">
                        {executeSignature}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card-panel p-5">
                <p className="text-eyebrow mb-3">Execute</p>
                <div className="space-y-3">
                  <ExecuteButton
                    className="w-full"
                    multisig={multisigParam}
                    transactionIndex={id}
                    onSubmitted={onExecuteSubmitted}
                    disabled={executeBlocked}
                    requireCofreInitialized={
                      (draft !== null && draft.kind !== "public") || payrollDraft !== null
                    }
                    transactionType={transactionType ?? "vault"}
                  />
                  {(status === "active" || status === "approved") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={cancelling}
                      onClick={() => void handleCancel()}
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
                    </Button>
                  )}
                  {cancelError && (
                    <p className="rounded-md border border-signal-danger/30 bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
                      {cancelError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Operator hand-off · cinematic next-stage card ──
                Shown only after on-chain settlement when the value still
                needs to flow through the Operator (private send / payroll). */}
            {executeComplete &&
              ((draft !== null && draft.kind !== "public") || isPayroll) &&
              (operatorDelivered ? (
                <div className="rounded-panel border border-signal-positive/25 bg-signal-positive/8 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal-positive/15 text-signal-positive">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-eyebrow text-signal-positive">
                        Private delivery · settled
                      </p>
                      <p className="mt-1 text-sm text-ink">
                        {isPayroll
                          ? "Operator delivered to all recipients."
                          : "Operator delivered to the recipient."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-panel border border-brass/30 bg-brass/5 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brass/40 bg-accent-soft text-accent">
                      <Key className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-eyebrow text-accent">Awaiting · Operator key</p>
                      <p className="mt-1 text-sm text-ink">
                        {isPayroll
                          ? "The Operator must release SOL to all recipients."
                          : "The Operator must release SOL to the recipient."}
                      </p>
                      <Link
                        href={`/vault/${multisigParam}/operator?proposal=${encodeURIComponent(id)}`}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-raise-1 transition-opacity hover:opacity-90"
                      >
                        Hand off to Operator
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
          </aside>
        </div>
      </div>
    </div>
  );
}

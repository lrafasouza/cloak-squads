"use client";

import { ApprovalButtons } from "@/components/proposal/ApprovalButtons";
import type { CommitmentCheckState } from "@/components/proposal/CommitmentCheck";
import { ExecuteButton } from "@/components/proposal/ExecuteButton";
import { AnimatedCard, StaggerContainer, StaggerItem } from "@/components/ui/animations";
import { useToast } from "@/components/ui/toast-provider";
import { type ProposalStatusKind, readProposalStatus } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import type { CommitmentClaim } from "@cloak-squads/core/commitment";
import { type MemberVote, getMemberVote } from "@cloak-squads/core/proposal-vote";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

function StatusBadge({ status }: { status: ProposalStatusKind }) {
  const styles = {
    draft: "bg-surface-2 text-neutral-300 border-border-strong",
    active: "bg-blue-900/50 text-blue-300 border-signal-info/30/50",
    approved: "bg-accent-soft/50 text-accent border-accent/20",
    rejected: "bg-signal-danger/15 text-signal-danger border-signal-danger/30",
    executing: "bg-amber-900/50 text-amber-300 border-signal-warn/30/50",
    executed: "bg-accent-soft/50 text-accent border-accent/20",
    cancelled: "bg-signal-danger/15 text-signal-danger border-signal-danger/30",
    unknown: "bg-surface-2 text-ink-muted border-border-strong",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-blue-400 animate-pulse" : status === "approved" || status === "executed" ? "bg-emerald-400" : status === "rejected" || status === "cancelled" ? "bg-red-400" : "bg-neutral-400"}`}
      />
      {status}
    </span>
  );
}

// ... (rest of types remain the same)

type ProposalDraft = {
  amount: string;
  recipient: string;
  memo: string;
  payloadHash: number[];
  invariants: {
    commitment: number[];
  };
};

type PayrollRecipient = {
  id: string;
  name: string;
  wallet: string;
  amount: string;
  memo?: string;
  payloadHash: number[];
  invariants: {
    commitment: number[];
  };
};

type PayrollDraft = {
  totalAmount: string;
  recipientCount: number;
  memo?: string;
  recipients: PayrollRecipient[];
};

export default function ProposalApprovalPage({
  params,
}: {
  params: Promise<{ multisig: string; id: string }>;
}) {
  const { multisig: multisigParam, id } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
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
  const [threshold, setThreshold] = useState<number | null>(null);
  const [memberVote, setMemberVote] = useState<MemberVote>(null);
  const [copied, setCopied] = useState(false);
  const [proposalUrl, setProposalUrl] = useState("");

  // ... (effects remain the same)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`claim:${multisigParam}:${id}`);
      if (raw) setCommitmentClaim(JSON.parse(raw) as CommitmentClaim);

      const payrollClaims = new Map<string, CommitmentClaim>();
      for (let i = 0; i < 10; i++) {
        const rawPayroll = sessionStorage.getItem(`claim:${multisigParam}:${id}:${i}`);
        if (rawPayroll) {
          payrollClaims.set(i.toString(), JSON.parse(rawPayroll) as CommitmentClaim);
        }
      }
      if (payrollClaims.size > 0) {
        setCommitmentClaims(payrollClaims);
      }
    } catch {
      /* ignore */
    }
  }, [multisigParam, id]);

  useEffect(() => {
    let cancelled = false;
    setDraftLoading(true);
    async function loadDraft() {
      const singleResponse = await fetchWithAuth(
        `/api/proposals/${encodeURIComponent(multisigParam)}/${encodeURIComponent(id)}`,
      );
      if (singleResponse.ok) {
        if (!cancelled) setDraft((await singleResponse.json()) as ProposalDraft);
        if (!cancelled) setDraftLoading(false);
        return;
      }

      const payrollResponse = await fetchWithAuth(
        `/api/payrolls/${encodeURIComponent(multisigParam)}/${encodeURIComponent(id)}`,
      );
      if (payrollResponse.ok) {
        if (!cancelled) setPayrollDraft((await payrollResponse.json()) as PayrollDraft);
        if (!cancelled) setDraftLoading(false);
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
      const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex: BigInt(id),
      });
      const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
      setStatus(readProposalStatus(proposal.status));
      setApprovals(proposal.approved.length);
      setMemberVote(getMemberVote(proposal, wallet.publicKey?.toBase58()));

      if (threshold === null) {
        try {
          const msAccount = await multisig.accounts.Multisig.fromAccountAddress(
            connection,
            multisigPda,
          );
          setThreshold(msAccount.threshold);
        } catch {
          // threshold unavailable
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
    if (
      status === "executed" ||
      status === "cancelled" ||
      status === "rejected" ||
      status === "missing"
    ) {
      return;
    }
    const interval = setInterval(() => void refreshStatus(), 3000);
    return () => clearInterval(interval);
  }, [status, refreshStatus]);

  useEffect(() => {
    setProposalUrl(window.location.href);
  }, []);

  const onVoteSubmitted = useCallback(
    (sig: string, kind: "approve" | "reject") => {
      setSignature(sig);
      setMemberVote(kind === "approve" ? "approved" : "rejected");
      addToast(
        kind === "approve" ? "Vote approved!" : "Vote rejected",
        kind === "approve" ? "success" : "info",
      );
      setTimeout(() => void refreshStatus(), 1500);
    },
    [refreshStatus, addToast],
  );

  const onExecuteSubmitted = useCallback(
    (sig: string) => {
      setExecuteSignature(sig);
      addToast("Transaction executed successfully!", "success");
      setTimeout(() => void refreshStatus(), 1500);
    },
    [refreshStatus, addToast],
  );

  const approveBlocked =
    (commitmentClaim !== null && commitmentState === "mismatch") || status !== "active";
  const executeBlocked = status !== "approved";
  const executeComplete = status === "executed" || executeSignature !== null;

  function copyProposalLink() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      addToast("Link copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isPayroll = payrollDraft !== null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-bg via-bg to-surface">
      <header className="border-b border-border/50 bg-bg/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href={`/vault/${multisigParam}`}
            className="flex items-center gap-2 text-sm font-semibold text-ink hover:text-accent transition-colors"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Cofre
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <StaggerContainer staggerDelay={0.1}>
          <StaggerItem>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-1.5 mb-3">
                <span className="text-sm font-medium text-accent">
                  {isPayroll ? "Payroll batch" : "Proposal"} #{id}
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-bold text-ink">Signer approval</h1>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                {isPayroll
                  ? `Review the ${payrollDraft?.recipientCount ?? 0} private transfer claims, verify commitments, then submit your Squads vote.`
                  : "Review the decrypted transfer claim, verify the commitment, then submit your Squads vote."}
              </p>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink flex items-center gap-2">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-ink-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                    Share with other signers
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-ink-subtle">{proposalUrl}</p>
                </div>
                <button
                  type="button"
                  onClick={copyProposalLink}
                  className="shrink-0 rounded-lg border border-border-strong bg-surface-2 px-4 py-2 text-xs font-semibold text-ink transition-all hover:bg-surface-3 hover:border-border-strong"
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="grid gap-4">
              {/* Transfer Claim Section */}
              {isPayroll ? (
                <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1">
                  <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-4">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-ink-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    Payroll batch — {payrollDraft?.recipientCount ?? 0} recipients
                  </h2>
                  {payrollDraft ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="pb-2 pr-4 text-ink-subtle text-xs uppercase tracking-wider">
                              Name
                            </th>
                            <th className="pb-2 pr-4 text-ink-subtle text-xs uppercase tracking-wider">
                              Wallet
                            </th>
                            <th className="pb-2 pr-4 text-ink-subtle text-xs uppercase tracking-wider text-right">
                              Amount
                            </th>
                            <th className="pb-2 text-ink-subtle text-xs uppercase tracking-wider">
                              Memo
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/50">
                          {payrollDraft.recipients.map((r) => (
                            <tr key={r.id} className="hover:bg-surface-2/30 transition-colors">
                              <td className="py-3 pr-4 text-ink font-medium">{r.name}</td>
                              <td className="py-3 pr-4 font-mono text-xs text-ink-muted">
                                {r.wallet.slice(0, 8)}...{r.wallet.slice(-8)}
                              </td>
                              <td className="py-3 pr-4 text-right font-mono tabular-nums text-ink">
                                {lamportsToSol(r.amount)} SOL
                              </td>
                              <td className="py-3 text-ink-subtle">{r.memo || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border-strong font-semibold">
                            <td colSpan={2} className="py-3 pr-4 text-ink">
                              Total
                            </td>
                            <td className="py-3 pr-4 text-right font-mono tabular-nums text-accent">
                              {lamportsToSol(payrollDraft.totalAmount)}
                            </td>
                            <td className="py-3 text-ink-subtle">SOL</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : draftLoading ? (
                    <div className="flex items-center gap-3 text-ink-muted py-4">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-emerald-400" />
                      <span>Loading payroll draft...</span>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-200">
                      No persisted payroll draft found for this multisig and proposal index.
                    </div>
                  )}
                </AnimatedCard>
              ) : (
                <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1">
                  <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-4">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-ink-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                    Transfer claim
                  </h2>
                  {draft ? (
                    <dl className="grid gap-4 text-sm">
                      {[
                        { label: "Amount", value: `${lamportsToSol(draft.amount)} SOL` },
                        { label: "Recipient", value: draft.recipient, isMono: true },
                        { label: "Memo", value: draft.memo || "None" },
                      ].map((item) => (
                        <div key={item.label} className="group">
                          <dt className="text-xs font-medium text-ink-subtle uppercase tracking-wider">
                            {item.label}
                          </dt>
                          <dd
                            className={`mt-1 ${item.isMono ? "break-all font-mono text-xs" : ""} text-ink bg-bg/50 rounded-lg px-3 py-2 border border-border/50`}
                          >
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : draftLoading ? (
                    <div className="flex items-center gap-3 text-ink-muted py-4">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-emerald-400" />
                      <span>Loading proposal draft...</span>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-200">
                      No persisted proposal draft found for this multisig and proposal index.
                    </div>
                  )}
                </AnimatedCard>
              )}

              {/* On-chain Status */}
              <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-ink-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    On-chain status
                  </h2>
                  <StatusBadge
                    status={status === "loading" || status === "missing" ? "unknown" : status}
                  />
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-ink-muted">Approvals</span>
                    <span className="font-mono text-ink">
                      {threshold !== null ? `${approvals}/${threshold}` : `${approvals} votes`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{
                        width: `${threshold && threshold > 0 ? Math.min(100, (approvals / threshold) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
                {status === "executed" || status === "cancelled" || status === "rejected" ? (
                  <p className="mt-4 text-sm text-amber-200">
                    This proposal is closed ({status}). Create a new one from the Send or Payroll
                    page to test again.
                  </p>
                ) : null}
                {status === "missing" ? (
                  <p className="mt-4 text-sm text-amber-200">
                    No proposal account at this index. The vault transaction may not have been
                    created yet, or this transactionIndex is wrong.
                  </p>
                ) : null}
              </AnimatedCard>

              {/* Vote */}
              <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1">
                <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-4">
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 text-ink-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  Vote
                </h2>
                {memberVote ? (
                  <div className="rounded-lg border border-emerald-900/50 bg-accent-soft p-4">
                    <div className="flex items-center gap-2">
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <p className="text-sm font-semibold text-accent">
                        You already{" "}
                        {memberVote === "approved"
                          ? "approved"
                          : memberVote === "rejected"
                            ? "rejected"
                            : "cancelled"}{" "}
                        this proposal.
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-accent/80">
                      Squads records one vote per member. The proposal can still move forward when
                      the threshold is reached.
                    </p>
                  </div>
                ) : (
                  <ApprovalButtons
                    multisig={multisigParam}
                    transactionIndex={id}
                    disabled={approveBlocked}
                    onSubmitted={onVoteSubmitted}
                  />
                )}
                {signature ? (
                  <p className="mt-4 break-all font-mono text-xs text-accent bg-emerald-950/20 rounded-lg px-3 py-2">
                    {signature}
                  </p>
                ) : null}
              </AnimatedCard>

              {/* Execute */}
              <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1">
                <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-4">
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 text-ink-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Execute
                </h2>
                {executeComplete ? (
                  <div className="rounded-lg border border-emerald-900/50 bg-accent-soft p-4">
                    <div className="flex items-center gap-2">
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <p className="text-sm font-semibold text-accent">
                        Vault transaction executed.
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-accent/80">
                      The Squads proposal is complete. The operator flow can now use the issued
                      license.
                    </p>
                    {executeSignature ? (
                      <p className="mt-3 break-all font-mono text-xs text-accent bg-emerald-950/20 rounded-lg px-3 py-2">
                        {executeSignature}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <ExecuteButton
                      multisig={multisigParam}
                      transactionIndex={id}
                      onSubmitted={onExecuteSubmitted}
                      disabled={executeBlocked}
                      requireCofreInitialized={draft !== null || payrollDraft !== null}
                    />
                    {!executeComplete && executeBlocked && status !== "loading" ? (
                      <p className="mt-3 text-xs text-ink-subtle">
                        {status === "active" && threshold !== null
                          ? `Need ${Math.max(0, threshold - approvals)} more approval(s) before executing.`
                          : `Execute requires status = approved. Current: ${status}.`}
                      </p>
                    ) : null}
                  </>
                )}
              </AnimatedCard>
            </div>
          </StaggerItem>
        </StaggerContainer>
      </section>
    </main>
  );
}

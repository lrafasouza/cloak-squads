"use client";

import type { CommitmentClaim } from "@cloak-squads/core/commitment";
import { getMemberVote, type MemberVote } from "@cloak-squads/core/proposal-vote";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ApprovalButtons } from "@/components/proposal/ApprovalButtons";
import { CommitmentCheck, type CommitmentCheckState } from "@/components/proposal/CommitmentCheck";
import { ExecuteButton } from "@/components/proposal/ExecuteButton";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";

type ProposalStatusKind =
  | "draft"
  | "active"
  | "approved"
  | "rejected"
  | "executing"
  | "executed"
  | "cancelled"
  | "unknown";

function readProposalStatus(status: unknown): ProposalStatusKind {
  if (status && typeof status === "object") {
    const kind = (status as { __kind?: unknown }).__kind;
    const key = typeof kind === "string" ? kind.toLowerCase() : undefined;
    if (
      key === "draft" ||
      key === "active" ||
      key === "approved" ||
      key === "rejected" ||
      key === "executing" ||
      key === "executed" ||
      key === "cancelled"
    ) {
      return key;
    }
  }
  return "unknown";
}

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
  const [commitmentState, setCommitmentState] = useState<CommitmentCheckState>("checking");
  const [signature, setSignature] = useState<string | null>(null);
  const [executeSignature, setExecuteSignature] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [payrollDraft, setPayrollDraft] = useState<PayrollDraft | null>(null);
  const [commitmentClaim, setCommitmentClaim] = useState<CommitmentClaim | null>(null);
  const [commitmentClaims, setCommitmentClaims] = useState<Map<string, CommitmentClaim>>(new Map());
  const [status, setStatus] = useState<ProposalStatusKind | "loading" | "missing">("loading");
  const [approvals, setApprovals] = useState<number>(0);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [memberVote, setMemberVote] = useState<MemberVote>(null);
  const [copied, setCopied] = useState(false);
  const [proposalUrl, setProposalUrl] = useState("");

  useEffect(() => {
    try {
      // Try loading single claim first
      const raw = sessionStorage.getItem(`claim:${multisigParam}:${id}`);
      if (raw) setCommitmentClaim(JSON.parse(raw) as CommitmentClaim);

      // Try loading payroll claims
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
    } catch { /* ignore */ }
  }, [multisigParam, id]);

  useEffect(() => {
    let cancelled = false;
    setDraftLoading(true);
    async function loadDraft() {
      // Try single proposal first
      const singleResponse = await fetch(
        `/api/proposals/${encodeURIComponent(multisigParam)}/${encodeURIComponent(id)}`,
      );
      if (singleResponse.ok) {
        if (!cancelled) setDraft((await singleResponse.json()) as ProposalDraft);
        if (!cancelled) setDraftLoading(false);
        return;
      }

      // Try payroll
      const payrollResponse = await fetch(
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

    loadDraft()
      .catch((error: unknown) => {
        console.warn("[proposals] could not load draft:", error);
        if (!cancelled) {
          setDraft(null);
          setPayrollDraft(null);
          setDraftLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [multisigParam, id]);

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
          const msAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
          setThreshold(msAccount.threshold);
        } catch {
          // threshold unavailable — leave as null
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
    if (status !== "loading" && status !== "missing") return;
    const interval = setInterval(() => void refreshStatus(), 3000);
    return () => clearInterval(interval);
  }, [status, refreshStatus]);

  const onVoteSubmitted = useCallback(
    (sig: string, kind: "approve" | "reject") => {
      setSignature(sig);
      setMemberVote(kind === "approve" ? "approved" : "rejected");
      setTimeout(() => void refreshStatus(), 1500);
    },
    [refreshStatus],
  );
  const onExecuteSubmitted = useCallback(
    (sig: string) => {
      setExecuteSignature(sig);
      setTimeout(() => void refreshStatus(), 1500);
    },
    [refreshStatus],
  );

  const approveBlocked =
    (commitmentClaim !== null && commitmentState === "mismatch") ||
    status !== "active";
  const executeBlocked = status !== "approved";
  const executeComplete = status === "executed" || executeSignature !== null;

  useEffect(() => {
    setProposalUrl(window.location.href);
  }, []);

  function copyProposalLink() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isPayroll = payrollDraft !== null;

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href={`/cofre/${multisigParam}`} className="text-sm font-semibold text-neutral-100">
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-emerald-300">
            {isPayroll ? "Payroll batch" : "Proposal"} #{id}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Signer approval</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            {isPayroll
              ? `Review the ${payrollDraft?.recipientCount ?? 0} private transfer claims, verify commitments, then submit your Squads vote.`
              : "Review the decrypted transfer claim, verify the commitment, then submit your Squads vote."}
          </p>
          <div className="mt-4 flex items-start gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">Share with other signers</p>
              <p className="mt-1 break-all font-mono text-xs text-neutral-400">
                {proposalUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={copyProposalLink}
              className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-100 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          {/* Step Timeline */}
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <ol className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-0">
              {(
                [
                  {
                    label: "Criado",
                    desc: "Proposal draft created",
                    done: true,
                    active: false,
                  },
                  {
                    label: "Aprovação",
                    desc: `${approvals}${threshold !== null ? `/${threshold}` : ""} approvals`,
                    done: status === "approved" || status === "executed" || executeComplete,
                    active: status === "active",
                  },
                  {
                    label: "Executado",
                    desc: "Squads tx executed",
                    done: status === "executed" || executeComplete,
                    active: status === "approved" && !executeComplete,
                  },
                  {
                    label: "Operador",
                    desc: "Cloak ZK deposit",
                    done: false,
                    active: executeComplete,
                  },
                ] as { label: string; desc: string; done: boolean; active: boolean }[]
              ).map((step, i, arr) => (
                <li key={step.label} className="flex flex-1 items-start gap-2 sm:flex-col sm:items-center sm:gap-1">
                  <div className="flex items-center sm:w-full">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ${
                        step.done
                          ? "bg-emerald-400 text-neutral-950 ring-emerald-400"
                          : step.active
                            ? "bg-transparent text-emerald-300 ring-emerald-400"
                            : "bg-transparent text-neutral-500 ring-neutral-700"
                      }`}
                    >
                      {step.done ? "✓" : i + 1}
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`hidden h-px flex-1 sm:block ${step.done ? "bg-emerald-700" : "bg-neutral-800"}`} />
                    )}
                  </div>
                  <div className="pb-1 sm:text-center">
                    <p className={`font-medium leading-tight ${step.done ? "text-emerald-300" : step.active ? "text-neutral-100" : "text-neutral-500"}`}>
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Transfer Claim Section */}
          {isPayroll ? (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="text-base font-semibold text-neutral-50">
                Payroll batch — {payrollDraft?.recipientCount ?? 0} recipients
              </h2>
              {payrollDraft ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-800 text-left">
                        <th className="pb-2 pr-4 text-neutral-400">Name</th>
                        <th className="pb-2 pr-4 text-neutral-400">Wallet</th>
                        <th className="pb-2 pr-4 text-neutral-400 text-right">Amount</th>
                        <th className="pb-2 text-neutral-400">Memo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {payrollDraft.recipients.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 pr-4 text-neutral-100">{r.name}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-neutral-300">
                            {r.wallet.slice(0, 8)}...{r.wallet.slice(-8)}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-neutral-100">
                            {Number(r.amount).toLocaleString()}
                          </td>
                          <td className="py-2 text-neutral-400">{r.memo || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-neutral-700 font-semibold">
                        <td colSpan={2} className="py-2 pr-4 text-neutral-100">Total</td>
                        <td className="py-2 pr-4 text-right font-mono text-emerald-300">
                          {Number(payrollDraft.totalAmount).toLocaleString()}
                        </td>
                        <td className="py-2 text-neutral-400">lamports</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : draftLoading ? (
                <p className="mt-3 text-sm text-neutral-400">Loading payroll draft…</p>
              ) : (
                <p className="mt-3 text-sm text-neutral-300">
                  No persisted payroll draft found for this multisig and proposal index.
                </p>
              )}
            </section>
          ) : (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="text-base font-semibold text-neutral-50">Transfer claim</h2>
              {draft ? (
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-neutral-400">Amount</dt>
                    <dd className="mt-1 font-mono text-neutral-100">{draft.amount}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">Recipient stealth pubkey</dt>
                    <dd className="mt-1 break-all font-mono text-neutral-100">{draft.recipient}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">Memo</dt>
                    <dd className="mt-1 text-neutral-100">{draft.memo || "None"}</dd>
                  </div>
                </dl>
              ) : draftLoading ? (
                <p className="mt-3 text-sm text-neutral-400">Loading proposal draft…</p>
              ) : (
                <p className="mt-3 text-sm text-neutral-300">
                  No persisted proposal draft found for this multisig and proposal index.
                </p>
              )}
            </section>
          )}

          {/* Commitment Check */}
          {isPayroll && payrollDraft ? (
            <div className="grid gap-3">
              {payrollDraft.recipients.map((r, i) => {
                const claim = commitmentClaims.get(i.toString());
                return claim ? (
                  <CommitmentCheck
                    key={r.id}
                    claim={{
                      ...claim,
                      onChainCommitment: Uint8Array.from(r.invariants.commitment),
                    }}
                    onStateChange={(state) => {
                      // For payroll, we just track the overall state
                      // If any fails, we show warning
                      if (state === "mismatch") {
                        setCommitmentState("mismatch");
                      }
                    }}
                  />
                ) : (
                  <section key={r.id} className="rounded-lg border border-amber-900 bg-amber-950 p-4 text-sm text-amber-100">
                    Commitment claim for {r.name} is only available in the proposer&apos;s browser session.
                  </section>
                );
              })}
            </div>
          ) : (
            commitmentClaim && draft ? (
              <CommitmentCheck
                claim={{
                  ...commitmentClaim,
                  onChainCommitment: Uint8Array.from(draft.invariants.commitment),
                }}
                onStateChange={setCommitmentState}
              />
            ) : (
              <section className="rounded-lg border border-amber-900 bg-amber-950 p-4 text-sm text-amber-100">
                Commitment claim is only available in the proposer&apos;s browser session.
              </section>
            )
          )}

          {/* On-chain Status */}
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-50">On-chain status</h2>
              <span className="font-mono text-xs uppercase tracking-wide text-neutral-300">
                {status === "loading"
                  ? "loading…"
                  : status === "missing"
                    ? "not found"
                    : threshold !== null
                      ? `${status} (${approvals}/${threshold} approvals)`
                      : `${status} (${approvals} approvals)`}
              </span>
            </div>
            {status === "executed" || status === "cancelled" || status === "rejected" ? (
              <p className="mt-3 text-sm text-amber-200">
                This proposal is closed ({status}). Create a new one from the Send or Payroll page to test
                again.
              </p>
            ) : null}
            {status === "missing" ? (
              <p className="mt-3 text-sm text-amber-200">
                No proposal account at this index. The vault transaction may not have been created
                yet, or this transactionIndex is wrong.
              </p>
            ) : null}
          </section>

          {/* Vote */}
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Vote</h2>
            {memberVote ? (
              <div className="rounded-md border border-emerald-900 bg-emerald-950 p-3">
                <p className="text-sm font-medium text-emerald-100">
                  You already {memberVote === "approved" ? "approved" : memberVote === "rejected" ? "rejected" : "cancelled"} this proposal.
                </p>
                <p className="mt-1 text-xs text-emerald-200/80">
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
            {signature ? <p className="mt-3 break-all font-mono text-xs text-emerald-200">{signature}</p> : null}
          </section>

          {/* Execute */}
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Execute</h2>
            {executeComplete ? (
              <div className="rounded-md border border-emerald-900 bg-emerald-950 p-3">
                <p className="text-sm font-medium text-emerald-100">
                  Vault transaction executed.
                </p>
                <p className="mt-1 text-xs text-emerald-200/80">
                  The Squads proposal is complete. The operator flow can now use the issued
                  license.
                </p>
                {executeSignature ? (
                  <p className="mt-3 break-all font-mono text-xs text-emerald-200">{executeSignature}</p>
                ) : null}
                <Link
                  href={`/cofre/${multisigParam}/operator?proposal=${id}`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-100 transition hover:bg-neutral-700"
                >
                  Go to Operator →
                </Link>
              </div>
            ) : (
              <ExecuteButton
                multisig={multisigParam}
                transactionIndex={id}
                onSubmitted={onExecuteSubmitted}
                disabled={executeBlocked}
              />
            )}
            {!executeComplete && executeBlocked && status !== "loading" ? (
              <p className="mt-2 text-xs text-neutral-400">
                {status === "active" && threshold !== null
                  ? `Need ${Math.max(0, threshold - approvals)} more approval(s) before executing.`
                  : `Execute requires status = approved. Current: ${status}.`}
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}

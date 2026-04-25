"use client";

import type { CommitmentClaim } from "@cloak-squads/core/commitment";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ApprovalButtons } from "@/components/proposal/ApprovalButtons";
import { CommitmentCheck, type CommitmentCheckState } from "@/components/proposal/CommitmentCheck";
import { ExecuteButton } from "@/components/proposal/ExecuteButton";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { loadProposalDraft } from "@/lib/session-cache";

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
    const key = Object.keys(status as Record<string, unknown>)[0]?.toLowerCase();
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
  commitmentClaim?: CommitmentClaim;
};

export default function ProposalApprovalPage({
  params,
}: {
  params: Promise<{ multisig: string; id: string }>;
}) {
  const { multisig: multisigParam, id } = use(params);
  const { connection } = useConnection();
  const [commitmentState, setCommitmentState] = useState<CommitmentCheckState>("checking");
  const [signature, setSignature] = useState<string | null>(null);
  const [executeSignature, setExecuteSignature] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [status, setStatus] = useState<ProposalStatusKind | "loading" | "missing">("loading");
  const [approvals, setApprovals] = useState<number>(0);

  useEffect(() => {
    const loaded = loadProposalDraft<ProposalDraft>(multisigParam, id);
    setDraft(loaded);
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
    } catch (err) {
      console.warn("[proposals] could not load proposal status:", err);
      setStatus("missing");
    }
  }, [connection, multisigParam, id]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const onVoteSubmitted = useCallback(
    (sig: string) => {
      setSignature(sig);
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
    (Boolean(draft?.commitmentClaim) && commitmentState === "mismatch") ||
    status !== "active";
  const executeBlocked = status !== "approved";

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
          <p className="text-sm font-medium text-emerald-300">Proposal #{id}</p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Signer approval</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Review the decrypted transfer claim, verify the commitment, then submit your Squads
            vote.
          </p>
        </div>

        <div className="grid gap-4">
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
            ) : (
              <p className="mt-3 text-sm text-neutral-300">
                No local proposal draft found in this browser session.
              </p>
            )}
          </section>

          {draft?.commitmentClaim ? (
            <CommitmentCheck
              claim={{
                ...draft.commitmentClaim,
                onChainCommitment: Uint8Array.from(draft.invariants.commitment),
              }}
              onStateChange={setCommitmentState}
            />
          ) : (
            <section className="rounded-lg border border-amber-900 bg-amber-950 p-4 text-sm text-amber-100">
              Commitment claim is not available in the local draft.
            </section>
          )}

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-50">On-chain status</h2>
              <span className="font-mono text-xs uppercase tracking-wide text-neutral-300">
                {status === "loading"
                  ? "loading…"
                  : status === "missing"
                    ? "not found"
                    : `${status} (${approvals} approvals)`}
              </span>
            </div>
            {status === "executed" || status === "cancelled" || status === "rejected" ? (
              <p className="mt-3 text-sm text-amber-200">
                This proposal is closed ({status}). Create a new one from the Send page to test
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

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Vote</h2>
            <ApprovalButtons
              multisig={multisigParam}
              transactionIndex={id}
              disabled={approveBlocked}
              onSubmitted={onVoteSubmitted}
            />
            {signature ? <p className="mt-3 break-all font-mono text-xs text-emerald-200">{signature}</p> : null}
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Execute</h2>
            <ExecuteButton
              multisig={multisigParam}
              transactionIndex={id}
              onSubmitted={onExecuteSubmitted}
              disabled={executeBlocked}
            />
            {executeBlocked && status !== "loading" ? (
              <p className="mt-2 text-xs text-neutral-400">
                Execute requires status = approved. Current: {status}.
              </p>
            ) : null}
            {executeSignature ? (
              <p className="mt-3 break-all font-mono text-xs text-emerald-200">{executeSignature}</p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}

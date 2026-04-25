"use client";

import type { CommitmentClaim } from "@cloak-squads/core/commitment";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ApprovalButtons } from "@/components/proposal/ApprovalButtons";
import { CommitmentCheck, type CommitmentCheckState } from "@/components/proposal/CommitmentCheck";
import { ExecuteButton } from "@/components/proposal/ExecuteButton";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { loadProposalDraft } from "@/lib/session-cache";

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
  const { multisig, id } = use(params);
  const [commitmentState, setCommitmentState] = useState<CommitmentCheckState>("checking");
  const [signature, setSignature] = useState<string | null>(null);
  const [executeSignature, setExecuteSignature] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProposalDraft | null>(null);

  useEffect(() => {
    const loaded = loadProposalDraft<ProposalDraft>(multisig, id);
    setDraft(loaded);
  }, [multisig, id]);

  const approveBlocked = Boolean(draft?.commitmentClaim) && commitmentState === "mismatch";

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href={`/cofre/${multisig}`} className="text-sm font-semibold text-neutral-100">
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
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Execute</h2>
            <ExecuteButton multisig={multisig} transactionIndex={id} onSubmitted={setExecuteSignature} />
            {executeSignature ? (
              <p className="mt-3 break-all font-mono text-xs text-emerald-200">{executeSignature}</p>
            ) : null}
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Vote</h2>
            <ApprovalButtons
              multisig={multisig}
              transactionIndex={id}
              disabled={approveBlocked}
              onSubmitted={setSignature}
            />
            {signature ? <p className="mt-3 break-all font-mono text-xs text-emerald-200">{signature}</p> : null}
          </section>
        </div>
      </section>
    </main>
  );
}

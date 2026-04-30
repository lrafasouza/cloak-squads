"use client";

import { Button } from "@/components/ui/button";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { proposalApprove, proposalReject } from "@/lib/squads-sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

export function ApprovalButtons({
  multisig,
  transactionIndex,
  disabled,
  onSubmitted,
}: {
  multisig: string;
  transactionIndex: string;
  disabled?: boolean;
  onSubmitted?: (signature: string, kind: "approve" | "reject") => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: "approve" | "reject") {
    setPending(kind);
    setError(null);
    const action = kind === "approve" ? "approval" : "rejection";
    startTransaction({
      title: kind === "approve" ? "Submitting approval" : "Submitting rejection",
      description: `Recording your Squads ${action} vote for proposal #${transactionIndex}.`,
      steps: [
        {
          id: "sign",
          title: "Sign vote",
          description: "Approve the wallet prompt to submit your vote.",
        },
        {
          id: "confirm",
          title: "Confirm vote on-chain",
          description: "Waiting for Solana confirmation.",
          status: "pending",
        },
      ],
    });
    try {
      const params = {
        connection,
        wallet,
        multisigPda: new PublicKey(multisig),
        transactionIndex: BigInt(transactionIndex),
        memo: kind === "approve" ? "Aegis F1 approved" : "Aegis F1 rejected",
      };
      const signature =
        kind === "approve" ? await proposalApprove(params) : await proposalReject(params);
      updateStep("sign", {
        status: "success",
        signature,
        description: "Wallet signature accepted.",
      });
      updateStep("confirm", {
        status: "success",
        signature,
        description: "Vote confirmed on-chain.",
      });
      completeTransaction({
        title: kind === "approve" ? "Approval submitted" : "Rejection submitted",
        description: `Proposal #${transactionIndex} vote is confirmed.`,
      });
      onSubmitted?.(signature, kind);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not submit vote";
      setError(message);
      failTransaction(message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          disabled={disabled || pending !== null}
          onClick={() => submit("approve")}
        >
          {pending === "approve" ? "Approving..." : "Approve"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pending !== null}
          onClick={() => submit("reject")}
        >
          {pending === "reject" ? "Rejecting..." : "Reject"}
        </Button>
      </div>
      {error ? <p className="text-sm text-signal-danger">{error}</p> : null}
    </div>
  );
}

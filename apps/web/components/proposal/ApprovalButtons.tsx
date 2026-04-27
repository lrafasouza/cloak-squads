"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { proposalApprove, proposalReject } from "@/lib/squads-sdk";

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
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: "approve" | "reject") {
    setPending(kind);
    setError(null);
    try {
      const params = {
        connection,
        wallet,
        multisigPda: new PublicKey(multisig),
        transactionIndex: BigInt(transactionIndex),
        memo: kind === "approve" ? "Cloak Squads F1 approved" : "Cloak Squads F1 rejected",
      };
      const signature = kind === "approve" ? await proposalApprove(params) : await proposalReject(params);
      onSubmitted?.(signature, kind);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit vote");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" disabled={disabled || pending !== null} onClick={() => submit("approve")}>
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
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

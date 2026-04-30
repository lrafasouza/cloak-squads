"use client";

import { Button } from "@/components/ui/button";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { publicEnv } from "@/lib/env";
import { vaultTransactionExecute } from "@/lib/squads-sdk";
import { assertCofreInitialized } from "@cloak-squads/core/cofre-status";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

export function ExecuteButton({
  multisig,
  transactionIndex,
  onSubmitted,
  disabled,
  requireCofreInitialized = true,
}: {
  multisig: string;
  transactionIndex: string;
  onSubmitted?: (signature: string) => void;
  disabled?: boolean;
  requireCofreInitialized?: boolean;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    startTransaction({
      title: "Executing vault transaction",
      description: `Completing Squads proposal #${transactionIndex} so the license can be used by the operator.`,
      steps: [
        {
          id: "readiness",
          title: "Check cofre readiness",
          description: "Verifying the cofre and proposal can execute.",
        },
        {
          id: "execute",
          title: "Sign and submit execution",
          description: "Approve the wallet prompt to execute the Squads vault transaction.",
        },
        {
          id: "confirm",
          title: "Confirm execution",
          description: "Waiting for Solana confirmation.",
          status: "pending",
        },
      ],
    });
    try {
      const multisigPda = new PublicKey(multisig);
      if (requireCofreInitialized) {
        await assertCofreInitialized({
          connection,
          multisig: multisigPda,
          gatekeeperProgram: new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
        });
      }
      updateStep("readiness", { status: "success" });
      updateStep("execute", { status: "running" });
      const signature = await vaultTransactionExecute({
        connection,
        wallet,
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
      });
      updateStep("execute", {
        status: "success",
        signature,
        description: "Execution transaction submitted.",
      });
      updateStep("confirm", {
        status: "success",
        signature,
        description: "Vault transaction confirmed.",
      });
      completeTransaction({
        title: "Vault transaction executed",
        description: "The license is issued and the operator can continue the private delivery.",
      });
      onSubmitted?.(signature);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not execute vault transaction";
      setError(message);
      failTransaction(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" disabled={pending || disabled} onClick={submit}>
        {pending ? "Executing..." : "Execute vault transaction"}
      </Button>
      {error ? <p className="text-sm text-signal-danger">{error}</p> : null}
    </div>
  );
}

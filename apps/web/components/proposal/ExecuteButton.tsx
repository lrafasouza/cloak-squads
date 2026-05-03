"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { publicEnv } from "@/lib/env";
import { configTransactionExecute, vaultTransactionExecute } from "@/lib/squads-sdk";
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
  transactionType = "vault",
}: {
  multisig: string;
  transactionIndex: string;
  onSubmitted?: (signature: string) => void;
  disabled?: boolean;
  requireCofreInitialized?: boolean;
  transactionType?: "config" | "vault";
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
  const { addToast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    startTransaction({
      title: `Executing ${transactionType === "config" ? "config" : "vault"} transaction`,
      description: `Completing Squads proposal #${transactionIndex}.`,
      steps: [
        {
          id: "readiness",
          title: "Check readiness",
          description: "Verifying the proposal can execute.",
        },
        {
          id: "execute",
          title: "Sign and submit execution",
          description: `Approve the wallet prompt to execute the Squads ${transactionType === "config" ? "config" : "vault"} transaction.`,
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
      const executeParams = {
        connection,
        wallet,
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
      };
      const signature =
        transactionType === "config"
          ? await configTransactionExecute(executeParams)
          : await vaultTransactionExecute(executeParams);
      updateStep("execute", {
        status: "success",
        signature,
        description: "Execution transaction submitted.",
      });
      updateStep("confirm", {
        status: "success",
        signature,
        description: `${transactionType === "config" ? "Config" : "Vault"} transaction confirmed.`,
      });
      completeTransaction({
        title: `${transactionType === "config" ? "Config" : "Vault"} transaction executed`,
        description:
          transactionType === "config"
            ? "The configuration change is complete."
            : "The license is issued and the operator can continue the private delivery.",
      });
      addToast("Proposal executed successfully!", "success", 3000);
      onSubmitted?.(signature);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not execute transaction";
      setError(message);
      failTransaction(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" disabled={pending || disabled} onClick={submit}>
        {pending ? "Executing..." : "Execute proposal"}
      </Button>
      {error ? <p className="text-sm text-signal-danger">{error}</p> : null}
    </div>
  );
}

"use client";

import { useToast } from "@/components/ui/toast-provider";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { WarningCallout } from "@/components/ui/warning-callout";
import { publicEnv } from "@/lib/env";
import { buildInitCofreIxBrowser } from "@/lib/gatekeeper-instructions";
import {
  createInitCofreProposal,
  proposalApprove,
  vaultTransactionExecute,
} from "@/lib/squads-sdk";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { vaultTopUpLamportsNeeded } from "@cloak-squads/core/vault-funding";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as sqdsMultisig from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

export function CofreInitBanner({ multisig }: { multisig: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
  const squadsProgram = useMemo(() => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBootstrap = useCallback(async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) return;
    setPending(true);
    setError(null);

    const multisigPk = new PublicKey(multisig);
    const [vault] = squadsVaultPda(multisigPk, squadsProgram);
    startTransaction({
      title: "Activating privacy layer",
      description: "Preparing the privacy activation proposal for this vault.",
      steps: [
        { id: "readiness", title: "Check readiness", description: "Checking vault status." },
        {
          id: "fund",
          title: "Fund vault rent",
          description: "Top up only if needed.",
          status: "pending",
        },
        {
          id: "proposal",
          title: "Create activation proposal",
          description: "Open the privacy setup proposal.",
          status: "pending",
        },
        {
          id: "execute",
          title: "Activate privacy layer",
          description: "Automatically enabled for single-signer vaults.",
          status: "pending",
        },
      ],
    });

    try {
      updateStep("readiness", { status: "success" });
      const vaultBalance = await connection.getBalance(vault, "confirmed");
      const topUpLamports = vaultTopUpLamportsNeeded(BigInt(vaultBalance));
      if (topUpLamports > 0n) {
        updateStep("fund", { status: "running" });
        const latestBlockhash = await connection.getLatestBlockhash();
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: vault,
            lamports: Number(topUpLamports),
          }),
        );
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = latestBlockhash.blockhash;
        const signature = await wallet.sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
        updateStep("fund", { status: "success", signature });
      } else {
        updateStep("fund", { status: "success", description: "Vault already funded." });
      }

      updateStep("proposal", { status: "running" });
      const initCofre = await buildInitCofreIxBrowser({
        multisig: multisigPk,
        operator: wallet.publicKey,
      });
      const bootstrap = await createInitCofreProposal({
        connection,
        wallet,
        multisigPda: multisigPk,
        initCofreIx: initCofre.instruction,
        memo: "Activate privacy layer",
      });
      updateStep("proposal", {
        status: "success",
        signature: bootstrap.signature,
        description: `Privacy activation proposal #${bootstrap.transactionIndex.toString()} confirmed.`,
      });

      const multisigAccount = await sqdsMultisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPk,
      );
      if (Number(multisigAccount.threshold) === 1) {
        updateStep("execute", { status: "running" });
        await proposalApprove({
          connection,
          wallet,
          multisigPda: multisigPk,
          transactionIndex: bootstrap.transactionIndex,
          memo: "Approve privacy activation",
        });
        const execSig = await vaultTransactionExecute({
          connection,
          wallet,
          multisigPda: multisigPk,
          transactionIndex: bootstrap.transactionIndex,
        });
        updateStep("execute", { status: "success", signature: execSig });
      } else {
        updateStep("execute", { status: "success", description: "Waiting for member approvals." });
      }

      await queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
      await queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      completeTransaction({
        title: "Privacy activation started",
        description: "The proposal has been created and is awaiting approvals.",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not initialize vault.";
      setError(message);
      failTransaction(message);
      addToast(message, "error");
    } finally {
      setPending(false);
    }
  }, [
    addToast,
    completeTransaction,
    connection,
    failTransaction,
    multisig,
    queryClient,
    squadsProgram,
    startTransaction,
    updateStep,
    wallet,
  ]);

  return (
    <div className="rounded-2xl bg-accent-soft/40 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
          <Shield className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-ink">Enable Private Transactions</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Create a proposal to activate the privacy layer for this vault.
          </p>
          {error && (
            <WarningCallout variant="error" className="mt-3">
              {error}
            </WarningCallout>
          )}
          <button
            type="button"
            onClick={handleBootstrap}
            disabled={pending || !wallet.connected}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Activating..." : "Enable Privacy"}
          </button>
        </div>
      </div>
    </div>
  );
}

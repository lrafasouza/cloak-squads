"use client";

import { Button } from "@/components/ui/button";
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
}: {
  multisig: string;
  transactionIndex: string;
  onSubmitted?: (signature: string) => void;
  disabled?: boolean;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const multisigPda = new PublicKey(multisig);
      await assertCofreInitialized({
        connection,
        multisig: multisigPda,
        gatekeeperProgram: new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
      });
      const signature = await vaultTransactionExecute({
        connection,
        wallet,
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
      });
      onSubmitted?.(signature);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not execute vault transaction");
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

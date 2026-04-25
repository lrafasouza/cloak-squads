"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { vaultTransactionExecute } from "@/lib/squads-sdk";

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
      const signature = await vaultTransactionExecute({
        connection,
        wallet,
        multisigPda: new PublicKey(multisig),
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
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

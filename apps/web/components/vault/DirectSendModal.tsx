"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { createVaultProposal } from "@/lib/squads-sdk";
import { solAmountToLamports } from "@cloak-squads/core/amount";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Send } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { publicEnv } from "@/lib/env";

export function DirectSendModal({
  multisig,
  open,
  onOpenChange,
  defaultRecipient = "",
  defaultAmount = "",
}: {
  multisig: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultRecipient?: string;
  defaultAmount?: string;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { addToast } = useToast();

  const [recipient, setRecipient] = useState(defaultRecipient);
  const [amount, setAmount] = useState(defaultAmount);
  const [memo, setMemo] = useState("");

  // Sync defaults when modal opens with new pre-filled values
  useEffect(() => {
    if (open) {
      setRecipient(defaultRecipient);
      setAmount(defaultAmount);
    }
  }, [open, defaultRecipient, defaultAmount]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const squadsProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID),
    [],
  );

  const reset = () => {
    setRecipient("");
    setAmount("");
    setMemo("");
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    let recipientPk: PublicKey;
    try {
      recipientPk = new PublicKey(recipient.trim());
    } catch {
      setError("Invalid recipient address.");
      return;
    }

    let lamports: bigint;
    try {
      lamports = solAmountToLamports(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid amount.");
      return;
    }

    setPending(true);
    try {
      const multisigPda = new PublicKey(multisig);
      const [vaultPda] = squadsVaultPda(multisigPda, squadsProgram);

      const ix = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: recipientPk,
        lamports,
      });

      await createVaultProposal({
        connection,
        wallet,
        multisigPda,
        instructions: [ix],
        memo: memo.trim() || "Direct payment",
      });

      addToast("Proposal created — members must approve before payment executes.", "success");
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) {
          onOpenChange(v);
          if (!v) reset();
        }
      }}
    >
      <DialogContent size="sm" autoClose={false}>
        <DialogHeader>
          <DialogTitle>Send SOL</DialogTitle>
          <DialogDescription>
            SOL is sent from the vault treasury. Requires member approval before execution.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds-recipient">Recipient address</Label>
            <Input
              id="ds-recipient"
              placeholder="Solana address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds-amount">Amount (SOL)</Label>
            <Input
              id="ds-amount"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds-memo">Memo (optional)</Label>
            <Input
              id="ds-memo"
              placeholder="What's this for?"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={pending}
            />
          </div>

          {error && (
            <p className="rounded-md bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
              {error}
            </p>
          )}

          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-ink-muted">
              This creates a{" "}
              <span className="font-medium text-ink">multisig proposal</span>. Once enough members
              approve, any member can execute and the SOL leaves the vault.
            </p>
          </div>

          <DialogFooter className="p-0 pt-0">
            <Button
              type="submit"
              disabled={pending || !recipient.trim() || !amount}
              className="w-full gap-2"
            >
              <Send className="h-4 w-4" />
              {pending ? "Creating proposal…" : "Create proposal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

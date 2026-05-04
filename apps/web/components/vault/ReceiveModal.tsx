"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { publicEnv } from "@/lib/env";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { PublicKey } from "@solana/web3.js";
import { Check, Copy } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

export function ReceiveModal({
  multisig,
  open,
  onOpenChange,
}: {
  multisig: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const squadsProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID),
    [],
  );

  const vaultAddress = useMemo(() => {
    try {
      const [vault] = squadsVaultPda(new PublicKey(multisig), squadsProgram);
      return vault.toBase58();
    } catch {
      return multisig;
    }
  }, [multisig, squadsProgram]);

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(vaultAddress, { width: 200, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [vaultAddress, open]);

  const copy = async () => {
    await navigator.clipboard.writeText(vaultAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Receive SOL</DialogTitle>
          <DialogDescription>
            Send SOL directly to this vault address. All deposits are public on-chain.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 p-6 pt-4">
          {qrDataUrl && (
            <div className="rounded-xl border border-border bg-white p-3">
              <img src={qrDataUrl} alt="Vault address QR code" width={160} height={160} />
            </div>
          )}

          <div className="w-full rounded-lg border border-border bg-surface-2 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              Vault address
            </p>
            <p className="break-all font-mono text-xs leading-relaxed text-ink">{vaultAddress}</p>
          </div>

          <button
            type="button"
            onClick={copy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
          >
            {copied ? (
              <Check className="h-4 w-4 text-signal-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied!" : "Copy address"}
          </button>

          <p className="text-center text-xs text-ink-subtle">
            For private payments use{" "}
            <span className="font-medium text-ink">Invoices</span>, those are unlinkable on-chain.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

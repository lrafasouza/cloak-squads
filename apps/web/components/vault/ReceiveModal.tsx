"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { publicEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { PublicKey } from "@solana/web3.js";
import { Check, Copy, Eye } from "lucide-react";
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
  const [selectedVaultIndex, setSelectedVaultIndex] = useState(0);
  const [subVaultAccounts, setSubVaultAccounts] = useState<
    Array<{ vaultIndex: number; name: string }>
  >([]);

  const squadsProgram = useMemo(() => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID), []);

  // Fetch sub-vaults whenever modal opens
  useEffect(() => {
    if (!open) return;
    fetch(`/api/vaults/${multisig}/sub-vaults`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ vaultIndex: number; name: string }>) => setSubVaultAccounts(data))
      .catch(() => {});
    setSelectedVaultIndex(0);
  }, [open, multisig]);

  const allAccounts = useMemo(
    () => [{ vaultIndex: 0, name: "Primary" }, ...subVaultAccounts],
    [subVaultAccounts],
  );

  const vaultAddress = useMemo(() => {
    try {
      const [vault] = squadsVaultPda(new PublicKey(multisig), squadsProgram, selectedVaultIndex);
      return vault.toBase58();
    } catch {
      return multisig;
    }
  }, [multisig, squadsProgram, selectedVaultIndex]);

  const selectedAccountName =
    allAccounts.find((a) => a.vaultIndex === selectedVaultIndex)?.name ?? "Primary";

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(vaultAddress, {
      width: 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
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
      <DialogContent size="sm" watermark watermarkSize={220} watermarkOpacity={0.04}>
        <DialogHeader>
          <p className="text-eyebrow">Receive · Public</p>
          <DialogTitle className="mt-0.5">Deposit SOL</DialogTitle>
          <DialogDescription>
            Send SOL directly to this address. Deposits land on-chain in the open — for unlinkable
            payments use <span className="font-medium text-ink">Invoices</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
          {/* Account selector — only when sub-vaults exist */}
          {subVaultAccounts.length > 0 && (
            <div>
              <p className="text-eyebrow mb-2">Receive into</p>
              <div className="flex flex-wrap gap-1.5">
                {allAccounts.map((acct) => {
                  const active = selectedVaultIndex === acct.vaultIndex;
                  return (
                    <button
                      key={acct.vaultIndex}
                      type="button"
                      onClick={() => setSelectedVaultIndex(acct.vaultIndex)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-xs font-medium transition-aegis",
                        active
                          ? "border-accent/40 bg-accent-soft text-accent"
                          : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
                      )}
                    >
                      {acct.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* QR — pure white card, framed by a thin border for both themes */}
          <div className="flex justify-center">
            <div className="rounded-xl border border-border bg-white p-3 shadow-raise-1">
              {qrDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={qrDataUrl}
                  alt="Vault address QR code"
                  width={176}
                  height={176}
                  className="block"
                />
              ) : (
                <div className="h-44 w-44 animate-pulse rounded bg-zinc-200" />
              )}
            </div>
          </div>

          {/* Address block — eyebrow + mono full string. Wraps responsively. */}
          <div className="rounded-list border border-border bg-surface-2 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-eyebrow">{selectedAccountName} address</p>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-ink-subtle">
                <Eye className="h-2.5 w-2.5" />
                Public
              </span>
            </div>
            <p className="mt-2 break-all font-mono text-xs leading-relaxed text-ink num">
              {vaultAddress}
            </p>
          </div>

          {/* Copy CTA — gold filled while idle, signal-positive flash on copy */}
          <button
            type="button"
            onClick={copy}
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold transition-aegis",
              copied
                ? "bg-signal-positive/15 text-signal-positive"
                : "bg-gradient-to-r from-accent to-accent-hover text-accent-ink shadow-raise-1 hover:shadow-accent-glow",
            )}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied to clipboard
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy address
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

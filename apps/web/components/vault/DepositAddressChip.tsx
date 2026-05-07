"use client";

import { publicEnv } from "@/lib/env";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { PublicKey } from "@solana/web3.js";
import { Check, Copy, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

export function DepositAddressChip({
  multisig,
  vaultIndex = 0,
  vaultName,
}: {
  multisig: string;
  vaultIndex?: number;
  vaultName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const vaultAddress = useMemo(() => {
    try {
      const [pda] = squadsVaultPda(
        new PublicKey(multisig),
        new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID),
        vaultIndex,
      );
      return pda.toBase58();
    } catch {
      return null;
    }
  }, [multisig, vaultIndex]);

  useEffect(() => {
    if (!qrOpen || !vaultAddress) return;
    void QRCode.toDataURL(vaultAddress, { width: 220, margin: 2 }).then(setQrUrl);
  }, [qrOpen, vaultAddress]);

  if (!vaultAddress) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(vaultAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const truncated = `${vaultAddress.slice(0, 6)}…${vaultAddress.slice(-6)}`;
  const showVaultLabel = vaultName && vaultName !== "Primary";

  return (
    <div className="rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-eyebrow text-ink-subtle">
            Deposit address{showVaultLabel ? ` · ${vaultName}` : ""}
          </p>
          <p className="mt-1 truncate font-mono text-sm text-ink">{truncated}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-3 hover:text-ink"
            aria-label="Copy deposit address"
            title={copied ? "Copied" : vaultAddress}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-accent" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setQrOpen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-3 hover:text-ink"
            aria-label={qrOpen ? "Hide QR code" : "Show QR code"}
            aria-expanded={qrOpen}
          >
            <QrCode className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-subtle">
        Send SOL here. The vault identifier in the header is for governance only; SOL sent to it is
        unrecoverable.
      </p>
      {qrOpen && qrUrl && (
        <div className="mt-3 flex justify-center">
          <img
            src={qrUrl}
            alt="Deposit QR"
            className="h-[220px] w-[220px] rounded-md border border-border bg-white p-2"
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  createUtxo,
  deriveUtxoKeypairFromSpendKey,
  fullWithdraw,
} from "@cloak.dev/sdk-devnet";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { use, useEffect, useState } from "react";

type StealthInvoice = {
  id: string;
  cofreAddress: string;
  recipientWallet: string;
  invoiceRef: string | null;
  memo: string | null;
  stealthPubkey: string;
  amountHint: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  // UTXO data for claim
  utxoAmount: string | null;
  utxoPrivateKey: string | null;
  utxoPublicKey: string | null;
  utxoBlinding: string | null;
  utxoMint: string | null;
  utxoLeafIndex: number | null;
  utxoCommitment: string | null;
};

type ClaimState = "loading" | "invalid" | "expired" | "claimed" | "voided" | "ready";

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function base64urlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function ClaimPage({ params }: { params: Promise<{ stealthId: string }> }) {
  const { stealthId } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();

  const [invoice, setInvoice] = useState<StealthInvoice | null>(null);
  const [claimState, setClaimState] = useState<ClaimState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);

  // Parse fragment from URL
  useEffect(() => {
    if (typeof window === "undefined") return;

    const fragment = window.location.hash.slice(1);
    if (!fragment) {
      setError("Missing access key in URL. Make sure you have the complete link with #fragment.");
      setClaimState("invalid");
      return;
    }

    const params = new URLSearchParams(fragment);
    const version = params.get("v");
    const sk = params.get("sk");
    const cofre = params.get("cofre");

    if (version !== "1" || !sk || !cofre) {
      setError("Invalid URL format. The link may be corrupted or incomplete.");
      setClaimState("invalid");
      return;
    }

    try {
      const secretKeyBytes = base64urlDecode(sk);
      if (secretKeyBytes.length !== 32) {
        setError("Invalid secret key length.");
        setClaimState("invalid");
        return;
      }

      new PublicKey(cofre); // validate cofre address
      setSecretKey(secretKeyBytes);
    } catch {
      setError("Invalid secret key or cofre address.");
      setClaimState("invalid");
      return;
    }
  }, [stealthId]);

  // Load invoice data
  useEffect(() => {
    if (!secretKey) return;

    const loadInvoice = async () => {
      try {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const cofre = params.get("cofre");
        if (!cofre) {
          setError("Missing cofre address in URL.");
          setClaimState("invalid");
          return;
        }

        const res = await fetch(`/api/stealth/${encodeURIComponent(cofre)}`);
        if (!res.ok) {
          setError("Failed to load invoice data.");
          setClaimState("invalid");
          return;
        }

        const invoices = (await res.json()) as StealthInvoice[];
        const found = invoices.find((inv) => inv.id === stealthId);

        if (!found) {
          setError("Invoice not found.");
          setClaimState("invalid");
          return;
        }

        if (found.status === "claimed") {
          setInvoice(found);
          setClaimState("claimed");
          return;
        }

        if (found.status === "voided") {
          setInvoice(found);
          setClaimState("voided");
          return;
        }

        if (new Date(found.expiresAt) < new Date()) {
          setInvoice(found);
          setClaimState("expired");
          return;
        }

        setInvoice(found);
        setClaimState("ready");
      } catch {
        setError("Failed to load invoice data.");
        setClaimState("invalid");
      }
    };

    void loadInvoice();
  }, [stealthId, secretKey]);

  const handleClaim = async () => {
    if (!invoice || !wallet.publicKey) return;

    setClaiming(true);
    setError(null);

    try {
      // Check if UTXO data is available for real claim
      if (
        invoice.utxoAmount &&
        invoice.utxoPrivateKey &&
        invoice.utxoBlinding &&
        invoice.utxoMint &&
        invoice.utxoCommitment
      ) {
        // Reconstruct UTXO for fullWithdraw
        const spendKeyBytes = new Uint8Array(32);
        const skHex = invoice.utxoPrivateKey.padStart(64, "0");
        for (let i = 0; i < 32; i++) {
          spendKeyBytes[i] = Number.parseInt(skHex.slice(i * 2, i * 2 + 2), 16);
        }

        const keypair = await deriveUtxoKeypairFromSpendKey(spendKeyBytes);
        const mint = new PublicKey(invoice.utxoMint);
        const amount = BigInt(invoice.utxoAmount);
        const utxo = await createUtxo(amount, keypair, mint);
        utxo.blinding = BigInt(`0x${invoice.utxoBlinding}`);
        if (invoice.utxoLeafIndex !== null) {
          utxo.index = invoice.utxoLeafIndex;
        }

        const result = await fullWithdraw(
          [utxo],
          wallet.publicKey,
          {
            connection,
            programId: CLOAK_PROGRAM_ID,
            relayUrl: "https://api.devnet.cloak.ag",
            signTransaction: wallet.signTransaction,
            depositorPublicKey: wallet.publicKey,
            onProgress: (s: string) => console.error(`[cloak-claim] ${s}`),
            onProofProgress: (p: number) => console.error(`[cloak-claim] proof ${p}%`),
          } as Parameters<typeof fullWithdraw>[2],
        );

        console.log("Claim tx:", result.signature);
      }

      // Call API to mark invoice as claimed
      const response = await fetch(`/api/stealth/${invoice.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimedBy: wallet.publicKey.toBase58() }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to claim invoice");
      }

      setClaimState("claimed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Claim failed.");
    } finally {
      setClaiming(false);
    }
  };

  const getStateMessage = () => {
    switch (claimState) {
      case "loading":
        return "Loading invoice data...";
      case "invalid":
        return "Invalid or corrupted link";
      case "expired":
        return "This invoice has expired";
      case "claimed":
        return "This invoice has already been claimed";
      case "voided":
        return "This invoice has been voided";
      case "ready":
        return "Ready to claim";
    }
  };

  const getStateColor = () => {
    switch (claimState) {
      case "loading":
        return "text-neutral-400";
      case "invalid":
      case "expired":
      case "voided":
        return "text-red-200";
      case "claimed":
        return "text-emerald-200";
      case "ready":
        return "text-emerald-300";
    }
  };

  if (claimState === "loading") {
    return (
      <main className="min-h-screen bg-neutral-950">
        <header className="border-b border-neutral-800 bg-neutral-950/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Cloak Squads
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-neutral-400">Loading invoice data...</p>
        </section>
      </main>
    );
  }

  if (claimState === "invalid") {
    return (
      <main className="min-h-screen bg-neutral-950">
        <header className="border-b border-neutral-800 bg-neutral-950/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Cloak Squads
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-8">
            <h1 className="text-xl font-semibold text-red-200">Access Error</h1>
            <p className="mt-4 text-neutral-300">{error ?? "Invalid or corrupted link."}</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-700"
            >
              Return Home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="rounded-md text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Cloak Squads
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-emerald-300">Stealth Invoice Claim</p>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  claimState === "ready"
                    ? "bg-emerald-900 text-emerald-200"
                    : claimState === "claimed"
                      ? "bg-blue-900 text-blue-200"
                      : "bg-red-900 text-red-200"
                }`}
              >
                {claimState}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Claim Invoice</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">{getStateMessage()}</p>
          </div>

          {invoice ? (
            <div className="flex flex-col gap-2 text-right">
              <p className="text-sm text-neutral-500">
                Cofre: {truncateAddress(invoice.cofreAddress)}
              </p>
              <p className="text-sm text-neutral-500">
                Created: {new Date(invoice.createdAt).toLocaleDateString()}
              </p>
              <p className="text-sm text-neutral-500">
                Expires: {new Date(invoice.expiresAt).toLocaleDateString()}
              </p>
            </div>
          ) : null}
        </div>

        {invoice ? (
          <>
            <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
              <h3 className="font-semibold text-neutral-50">Invoice Details</h3>
              <dl className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <dt className="text-xs text-neutral-500">Invoice ID</dt>
                  <dd className="mt-1 font-mono text-sm text-neutral-300">{invoice.id}</dd>
                </div>
                {invoice.invoiceRef ? (
                  <div>
                    <dt className="text-xs text-neutral-500">Reference</dt>
                    <dd className="mt-1 text-sm text-neutral-300">{invoice.invoiceRef}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-neutral-500">Amount</dt>
                  <dd className="mt-1 font-mono text-sm text-neutral-300">
                    {invoice.amountHint
                      ? `${Number(invoice.amountHint).toLocaleString()} lamports`
                      : "Hidden"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Stealth Pubkey</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-neutral-300">
                    {invoice.stealthPubkey}
                  </dd>
                </div>
                {invoice.memo ? (
                  <div className="md:col-span-2">
                    <dt className="text-xs text-neutral-500">Memo</dt>
                    <dd className="mt-1 text-sm text-neutral-300">{invoice.memo}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {claimState === "ready" ? (
              <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
                <h3 className="font-semibold text-neutral-50">Claim Funds</h3>
                <p className="mt-2 text-sm text-neutral-300">
                  Connect your wallet and click the button below to claim the funds. This will
                  execute a full withdrawal to your connected wallet.
                </p>

                {!wallet.publicKey ? (
                  <p className="mt-4 text-sm text-amber-300">
                    Please connect your wallet to continue.
                  </p>
                ) : (
                  <div className="mt-4">
                    <p className="mb-3 text-sm text-neutral-400">
                      Connected: {truncateAddress(wallet.publicKey.toBase58())}
                    </p>
                    <Button onClick={handleClaim} disabled={claiming}>
                      {claiming ? "Processing claim..." : "Claim funds"}
                    </Button>
                  </div>
                )}

                {error ? (
                  <p className="mt-4 rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
                    {error}
                  </p>
                ) : null}
              </section>
            ) : (
              <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-center">
                <p className={`text-lg font-medium ${getStateColor()}`}>{getStateMessage()}</p>
                {claimState === "expired" ? (
                  <p className="mt-2 text-sm text-neutral-400">
                    This invoice expired on {new Date(invoice.expiresAt).toLocaleString()}.
                  </p>
                ) : null}
                <Link
                  href="/"
                  className="mt-4 inline-block rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-700"
                >
                  Return Home
                </Link>
              </section>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}

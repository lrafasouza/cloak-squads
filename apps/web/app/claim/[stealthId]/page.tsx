"use client";

import { Button } from "@/components/ui/button";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { ensureCircuitsProxy } from "@/lib/cloak-circuits-proxy";
import { translateCloakProgress } from "@/lib/cloak-progress";
import { lamportsToSol } from "@/lib/sol";
import { statusBadge } from "@/lib/status-labels";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cloakDirectTransactOptions } from "@cloak-squads/core/cloak-direct-mode";
import {
  CLOAK_PROGRAM_ID,
  computeUtxoCommitment,
  createUtxo,
  derivePublicKey,
  fullWithdraw,
} from "@cloak.dev/sdk-devnet";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
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
  claimedAt: string | null;
};

type ClaimUtxoData = {
  utxoAmount: string;
  utxoPrivateKey: string;
  utxoBlinding: string;
  utxoMint: string;
  utxoLeafIndex: number | null;
  utxoCommitment: string;
  utxoSiblingCommitment: string | null;
  utxoLeftSiblingCommitment: string | null;
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

function base64urlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export default function ClaimPage({ params }: { params: Promise<{ stealthId: string }> }) {
  const { stealthId } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { startTransaction, updateTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const [invoice, setInvoice] = useState<StealthInvoice | null>(null);
  const [claimState, setClaimState] = useState<ClaimState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once on mount; window.location is not reactive
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
    const vault = params.get("vault") ?? params.get("cofre"); // support both for backward compat

    if (version !== "1" || !sk || !vault) {
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

      new PublicKey(vault); // validate vault address
      setSecretKey(secretKeyBytes);
    } catch {
      setError("Invalid secret key or vault address.");
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
        const vault = params.get("vault") ?? params.get("cofre"); // support both for backward compat
        if (!vault) {
          setError("Missing vault address in URL.");
          setClaimState("invalid");
          return;
        }

        const res = await fetch(`/api/stealth/invoice/${encodeURIComponent(stealthId)}`);
        if (!res.ok) {
          setError("Failed to load invoice data.");
          setClaimState("invalid");
          return;
        }

        const found = (await res.json()) as StealthInvoice;

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
  }, [fetchWithAuth, stealthId, secretKey]);

  const handleClaim = async () => {
    if (!invoice || !wallet.publicKey || !secretKey) return;

    setClaiming(true);
    setError(null);
    startTransaction({
      title: "Claiming invoice",
      description: invoice.amountHint
        ? `Withdrawing ${lamportsToSol(invoice.amountHint)} SOL from Cloak to your connected wallet.`
        : "Withdrawing the private invoice funds to your connected wallet.",
      steps: [
        {
          id: "prepare",
          title: "Prepare claim",
          description: "Reconstructing the private UTXO from the invoice access key.",
        },
        {
          id: "withdraw",
          title: "Withdraw from Cloak",
          description: "Securing the transfer and submitting the withdrawal transaction.",
          status: "pending",
        },
        {
          id: "record",
          title: "Mark invoice claimed",
          description: "Updating the invoice record after on-chain confirmation.",
          status: "pending",
        },
      ],
    });

    try {
      updateStep("prepare", { status: "running" });

      // Step 1: Request challenge from server
      const challengeRes = await fetch(`/api/stealth/${invoice.id}/challenge`, { method: "POST" });
      if (!challengeRes.ok) {
        const body = (await challengeRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not request claim challenge.");
      }
      const { challengeId, challenge } = (await challengeRes.json()) as { challengeId: string; challenge: string };

      // Step 2: Derive Ed25519 signing key from the same seed as the box keypair
      // The box secret key's first 32 bytes are the seed for both key types.
      const nacl = await import("tweetnacl");
      const challengeBytes = base64urlDecode(challenge);
      const signKeypair = nacl.sign.keyPair.fromSeed(secretKey);
      const challengeSignature = nacl.sign.detached(challengeBytes, signKeypair.secretKey);

      // Step 3: Derive the box public key to prove ownership matches stored stealthPubkey
      const boxKeypair = nacl.box.keyPair.fromSecretKey(secretKey);
      const derivedPubkey = bs58.encode(boxKeypair.publicKey);

      // Step 4: Send challengeId + derivedPubkey + signature to claim-data endpoint
      const utxoResponse = await fetchWithAuth(`/api/stealth/${invoice.id}/claim-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          derivedPubkey,
          challengeSignature: base64urlEncode(challengeSignature),
        }),
      });
      if (!utxoResponse.ok) {
        const body = (await utxoResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Invoice UTXO data is missing.");
      }

      const claimUtxo = (await utxoResponse.json()) as ClaimUtxoData;
      if (
        !claimUtxo.utxoAmount ||
        !claimUtxo.utxoPrivateKey ||
        !claimUtxo.utxoBlinding ||
        !claimUtxo.utxoMint ||
        !claimUtxo.utxoCommitment
      ) {
        throw new Error(
          "Invoice UTXO data is missing. The invoice may not have been funded on-chain yet. Please verify the deposit was completed before claiming.",
        );
      }

      // Reconstruct UTXO for fullWithdraw. The stored privateKey is the raw
      // field element from generateUtxoKeypair(), not a wallet spend key.
      const privateKey = BigInt(`0x${claimUtxo.utxoPrivateKey.padStart(64, "0")}`);
      const publicKey = await derivePublicKey(privateKey);
      const keypair = { privateKey, publicKey };
      const mint = new PublicKey(claimUtxo.utxoMint);
      const amount = BigInt(claimUtxo.utxoAmount);
      const utxo = await createUtxo(amount, keypair, mint);
      utxo.blinding = BigInt(`0x${claimUtxo.utxoBlinding}`);
      utxo.commitment = await computeUtxoCommitment(utxo);
      if (claimUtxo.utxoLeafIndex !== null) {
        utxo.index = claimUtxo.utxoLeafIndex;
      }
      if (claimUtxo.utxoSiblingCommitment) {
        utxo.siblingCommitment = BigInt(`0x${claimUtxo.utxoSiblingCommitment}`);
      }
      if (claimUtxo.utxoLeftSiblingCommitment) {
        (utxo as typeof utxo & { leftSiblingCommitment?: bigint }).leftSiblingCommitment = BigInt(
          `0x${claimUtxo.utxoLeftSiblingCommitment}`,
        );
      }
      updateStep("prepare", { status: "success" });
      updateStep("withdraw", { status: "running" });

      // Route circuit fetches through our same-origin proxy to bypass S3 CORS.
      ensureCircuitsProxy();
      const result = await fullWithdraw([utxo], wallet.publicKey, {
        connection,
        programId: CLOAK_PROGRAM_ID,
        ...cloakDirectTransactOptions,
        relayUrl: `${window.location.origin}/api/cloak-relay`,
        signTransaction: wallet.signTransaction,
        ...(wallet.signMessage ? { signMessage: wallet.signMessage } : {}),
        depositorPublicKey: wallet.publicKey,
        onProgress: (s: string) => {
          console.debug(`[cloak-claim] ${s}`);
          updateTransaction({ detail: translateCloakProgress(s) });
        },
        onProofProgress: (p: number) => {
          console.debug(`[cloak-claim] proof ${p}%`);
          updateTransaction({ proofProgress: p });
        },
      } as Parameters<typeof fullWithdraw>[2]);

      updateStep("withdraw", {
        status: "success",
        signature: result.signature,
        description: "Claim withdrawal confirmed.",
      });

      updateStep("record", { status: "running" });
      // Call API to mark invoice as claimed
      const response = await fetchWithAuth(`/api/stealth/${invoice.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimedBy: wallet.publicKey.toBase58() }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to claim invoice");
      }

      updateStep("record", { status: "success" });
      completeTransaction({
        title: "Invoice claimed",
        description: "The invoice is marked claimed and the on-chain claim flow is complete.",
      });
      setClaimState("claimed");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Claim failed.";
      setError(message);
      failTransaction(message);
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

  const getStateLabel = () => {
    switch (claimState) {
      case "loading":
        return "Loading";
      case "invalid":
        return "Invalid";
      case "expired":
        return "Expired";
      case "claimed":
        return "Claimed";
      case "voided":
        return "Voided";
      case "ready":
        return "Ready";
    }
  };

  const getStateColor = () => {
    switch (claimState) {
      case "loading":
        return "text-ink-muted";
      case "invalid":
      case "expired":
      case "voided":
        return "text-red-200";
      case "claimed":
        return "text-accent";
      case "ready":
        return "text-accent";
    }
  };

  if (claimState === "loading") {
    return (
      <main className="min-h-screen bg-bg">
        <section className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-ink-muted">Loading invoice data...</p>
        </section>
      </main>
    );
  }

  if (claimState === "invalid") {
    return (
      <main className="min-h-screen bg-bg">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-8">
            <h1 className="text-xl font-semibold text-red-200">Access Error</h1>
            <p className="mt-4 text-neutral-300">{error ?? "Invalid or corrupted link."}</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-surface-2 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-surface-3"
            >
              Return Home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-accent">Payment Claim</p>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(claimState).bg} ${statusBadge(claimState).text}`}
              >
                {getStateLabel()}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Claim Invoice</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">{getStateMessage()}</p>
          </div>

          {invoice ? (
            <div className="flex flex-col gap-2 text-right">
              <p className="text-sm text-ink-subtle">
                Vault: {truncateAddress(invoice.cofreAddress)}
              </p>
              <p className="text-sm text-ink-subtle">
                Created: {new Date(invoice.createdAt).toLocaleDateString()}
              </p>
              <p className="text-sm text-ink-subtle">
                Expires: {new Date(invoice.expiresAt).toLocaleDateString()}
              </p>
            </div>
          ) : null}
        </div>

        {invoice ? (
          <>
            <section className="mt-8 rounded-lg border border-border bg-surface p-6">
              <h3 className="font-semibold text-ink">Invoice Details</h3>
              <dl className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink-subtle">Invoice ID</dt>
                  <dd className="mt-1 font-mono text-sm text-neutral-300">{invoice.id}</dd>
                </div>
                {invoice.invoiceRef ? (
                  <div>
                    <dt className="text-xs text-ink-subtle">Reference</dt>
                    <dd className="mt-1 text-sm text-neutral-300">{invoice.invoiceRef}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-ink-subtle">Amount</dt>
                  <dd className="mt-1 font-mono text-sm text-neutral-300">
                    {invoice.amountHint ? `${lamportsToSol(invoice.amountHint)} SOL` : "Hidden"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-subtle">Recipient Key</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-neutral-300">
                    {invoice.stealthPubkey}
                  </dd>
                </div>
                {invoice.memo ? (
                  <div className="md:col-span-2">
                    <dt className="text-xs text-ink-subtle">Message</dt>
                    <dd className="mt-1 text-sm text-neutral-300">{invoice.memo}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {claimState === "ready" ? (
              <section className="mt-8 rounded-lg border border-border bg-surface p-6">
                <h3 className="font-semibold text-ink">Claim Funds</h3>
                <p className="mt-2 text-sm text-neutral-300">
                  Connect your wallet and use the button below to claim the funds.
                </p>

                {!wallet.publicKey ? (
                  <p className="mt-4 text-sm text-amber-300">Connect your wallet to continue.</p>
                ) : invoice.recipientWallet !== wallet.publicKey.toBase58() ? (
                  <div className="mt-4 rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
                    <p className="font-medium">Wrong wallet</p>
                    <p className="mt-1 text-xs text-signal-danger">
                      This invoice was created for wallet{" "}
                      <span className="font-mono">{truncateAddress(invoice.recipientWallet)}</span>.
                      Connect that wallet to claim.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4">
                    <p className="mb-3 text-sm text-accent">Correct wallet connected</p>
                    <Button onClick={handleClaim} disabled={claiming}>
                      {claiming ? "Claiming funds..." : "Claim funds"}
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
              <section className="mt-8 rounded-lg border border-border bg-surface p-6 text-center">
                <p className={`text-lg font-medium ${getStateColor()}`}>{getStateMessage()}</p>
                {claimState === "expired" ? (
                  <p className="mt-2 text-sm text-ink-muted">
                    This invoice expired on {new Date(invoice.expiresAt).toLocaleString()}.
                  </p>
                ) : null}
                <Link
                  href="/"
                  className="mt-4 inline-block rounded-md bg-surface-2 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-surface-3"
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

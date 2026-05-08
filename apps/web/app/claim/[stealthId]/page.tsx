"use client";

import { Address, type AegisStatus, StatusBadge } from "@/components/ui/aegis";
import { Button } from "@/components/ui/button";
import { ReceiptRow } from "@/components/ui/receipt-row";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { ensureCircuitsProxy, prefetchCircuits } from "@/lib/cloak-circuits-proxy";
import { translateCloakProgress } from "@/lib/cloak-progress";
import { lamportsToSol } from "@/lib/sol";
import { useUnloadGuard } from "@/lib/use-unload-guard";
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
import { CheckCircle2, Loader2, ShieldOff } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

type StealthInvoice = {
  id: string;
  cofreAddress: string;
  recipientWallet: string | null;
  mode: "bound" | "bearer";
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
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
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

const STATE_TO_BADGE: Record<Exclude<ClaimState, "loading" | "invalid">, AegisStatus> = {
  ready: "sealed",
  claimed: "executed",
  expired: "expired",
  voided: "revoked",
};

const STATE_LABEL: Record<ClaimState, string> = {
  loading: "Loading",
  invalid: "Invalid",
  ready: "Ready",
  claimed: "Claimed",
  expired: "Expired",
  voided: "Voided",
};

/* Resolved-state copy is intentionally generic — no amount, no vault, no
 * timestamps, no IDs. The whole point of a private invoice is that someone
 * landing on a stale link (browser history, leaked URL, shared device) sees
 * nothing about who paid whom or how much. The fragment validates ownership
 * for the *active* claim flow, not for retroactive viewing. */
const RESOLVED_COPY: Record<"claimed" | "expired" | "voided", { title: string; body: string }> = {
  claimed: {
    title: "Invoice already claimed",
    body: "This private payment link is no longer active.",
  },
  expired: {
    title: "Invoice expired",
    body: "This private payment link is no longer active. Ask the sender to issue a new one.",
  },
  voided: {
    title: "Invoice voided",
    body: "The sender cancelled this private payment before it was claimed. Reach out to them for a new link.",
  },
};

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

  // Block tab close while a ZK proof / withdraw is in progress.
  useUnloadGuard(claiming);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);

  // Pre-fetch ZK circuits as soon as the page mounts so the ~12MB of wasm/zkey
  // is in the browser cache by the time the user clicks "Claim". Without this,
  // the proof step has to download circuits + generate proof serially (~30s+).
  useEffect(() => {
    prefetchCircuits();
  }, []);

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
  }, [stealthId, secretKey]);

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
      const { challengeId, challenge } = (await challengeRes.json()) as {
        challengeId: string;
        challenge: string;
      };

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
          updateTransaction({
            detail: translateCloakProgress(s),
          });
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

  /* ────────────────────────────────────────────────────────── States ── */

  if (claimState === "loading") {
    return (
      <main className="min-h-screen bg-bg">
        <section className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14">
          <div className="card-hero relative p-8 md:p-10">
            <div className="relative">
              <div className="text-eyebrow">Aegis · Private payment</div>
              <div className="mt-3 h-10 w-56 rounded-md shimmer-bg" />
              <div className="mt-3 h-4 w-72 rounded shimmer-bg" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (claimState === "invalid") {
    return (
      <main className="min-h-screen bg-bg">
        <section className="mx-auto w-full max-w-2xl px-4 py-16 md:py-20">
          <div className="card-panel p-8 md:p-10 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-signal-danger/10 text-signal-danger">
              <ShieldOff className="h-6 w-6" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-semibold text-ink">Access error</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-muted">
              {error ?? "Invalid or corrupted link."}
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink transition-aegis hover:bg-surface-3"
            >
              Return home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!invoice) {
    return null;
  }

  /* ── Privacy guard · resolved states render only amount + memo ──────────
   *
   * If the invoice is no longer claimable (already claimed, expired, or
   * voided) we keep the SOL amount and the sender's memo as a
   * personal-record breadcrumb — they're meaningful to the recipient
   * who originally landed here. Everything else is suppressed: no vault
   * address, no recipient key, no bound wallet, no invoice ID, no
   * invoice reference, no timestamps. The fragment authorises the
   * active claim flow; it is not a retroactive view key, so anyone
   * else who happens onto the URL after the fact sees no addresses or
   * identifiers tying the payment to a counterparty. */
  if (claimState !== "ready") {
    const copy = RESOLVED_COPY[claimState];
    const isClaimed = claimState === "claimed";
    const resolvedAmount = invoice.amountHint ? lamportsToSol(invoice.amountHint) : null;
    return (
      <main className="min-h-screen bg-bg">
        <section className="mx-auto w-full max-w-2xl px-4 py-16 md:py-20">
          <div className="card-panel relative overflow-hidden p-8 md:p-10 text-center">
            <div className="relative">
              <span
                className={`mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full ${
                  isClaimed
                    ? "bg-signal-positive/15 text-signal-positive"
                    : "bg-signal-danger/10 text-signal-danger"
                }`}
              >
                {isClaimed ? <CheckCircle2 className="h-6 w-6" /> : <ShieldOff className="h-6 w-6" />}
              </span>
              <div className="text-eyebrow mt-5">Aegis · Private payment</div>
              <h1 className="mt-2 font-display text-2xl font-semibold text-ink">{copy.title}</h1>

              {resolvedAmount ? (
                <p className="mt-4 font-display text-3xl font-semibold tabular-nums tracking-tight text-ink md:text-4xl">
                  {resolvedAmount}
                  <span className="ml-1.5 font-sans text-sm font-medium text-ink-subtle">SOL</span>
                </p>
              ) : null}

              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-ink-muted">{copy.body}</p>

              {invoice.memo ? (
                <p className="mx-auto mt-5 max-w-sm rounded-md border border-border/60 bg-surface-2 p-3 text-left text-sm leading-6 text-ink">
                  {invoice.memo}
                </p>
              ) : null}

              <Link
                href="/"
                className="mt-6 inline-flex items-center justify-center rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink transition-aegis hover:bg-surface-3"
              >
                Return home
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  /* ────────────────────────────────────────────────────────── Hero card ── */

  const heroAmount = invoice.amountHint ? `${lamportsToSol(invoice.amountHint)}` : null;
  const badgeStatus = STATE_TO_BADGE[claimState];

  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14">
        {/* Hero — leads with the amount, the recipient's anchor */}
        <div className="card-hero relative overflow-hidden p-8 md:p-10">
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div className="text-eyebrow text-accent">Aegis · Private payment</div>
              <StatusBadge status={badgeStatus}>{STATE_LABEL[claimState]}</StatusBadge>
            </div>

            {heroAmount ? (
              <p className="mt-4 font-display text-4xl font-semibold leading-none tracking-tight text-ink md:text-6xl">
                {heroAmount}
                <span className="ml-2 font-sans text-base font-medium text-ink-subtle md:text-xl">
                  SOL
                </span>
              </p>
            ) : (
              <p className="mt-4 font-display text-4xl font-semibold italic leading-none tracking-tight text-ink-muted md:text-5xl">
                Hidden amount
              </p>
            )}

            <p className="mt-4 max-w-xl text-sm leading-6 text-ink-muted md:text-[15px]">
              Settle this private payment by claiming the funds to your connected wallet.
            </p>
          </div>
        </div>

        {/* Optional context · only what the sender chose to attach.
         * No invoice IDs, no vault addresses, no recipient keys, no
         * bound-to wallet — those are technical metadata and would
         * leave a privacy trace on a screen anyone could glance at. */}
        {invoice.invoiceRef || invoice.memo ? (
          <div className="card-panel relative mt-6 overflow-hidden p-6 md:p-7">
            <div className="text-eyebrow">From the sender</div>
            <div className="mt-3 space-y-3">
              {invoice.invoiceRef ? (
                <ReceiptRow label="Reference" mono={false}>
                  {invoice.invoiceRef}
                </ReceiptRow>
              ) : null}
              {invoice.memo ? (
                <p className="rounded-md border border-border/60 bg-surface-2 p-3 text-sm leading-6 text-ink">
                  {invoice.memo}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Action zone — claimState is guaranteed `ready` here (resolved
         * states are intercepted by the privacy guard above). */}
        <div className="card-panel relative mt-6 overflow-hidden p-6 md:p-7">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-eyebrow">Claim funds</div>
                <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                  Withdraw to your wallet
                </h2>
              </div>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">
              The proof and withdrawal happen in your browser. Keep this tab open until the receipt
              confirms execution.
            </p>

            <div className="mt-5 space-y-4">
              {!wallet.publicKey ? (
                <div className="rounded-md border border-border-strong bg-surface-2 p-4 text-sm text-ink-muted">
                  <p className="font-medium text-ink">Connect your wallet to continue.</p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    Use the wallet menu in the page header to connect a Solana wallet.
                  </p>
                </div>
              ) : invoice.mode === "bound" &&
                invoice.recipientWallet !== wallet.publicKey.toBase58() ? (
                <div className="rounded-md border border-signal-danger/30 bg-signal-danger/10 p-4 text-sm">
                  <p className="font-medium text-signal-danger">Wrong wallet connected</p>
                  <p className="mt-1 text-xs text-signal-danger/90">
                    This invoice is bound to{" "}
                    <span className="font-mono">
                      {invoice.recipientWallet
                        ? truncateAddress(invoice.recipientWallet)
                        : "(unknown)"}
                    </span>
                    . Switch wallets and reconnect to claim.
                  </p>
                </div>
              ) : (
                <>
                  {invoice.mode === "bearer" ? (
                    <div className="rounded-md border border-signal-warn/30 bg-signal-warn/10 p-4 text-xs leading-5 text-signal-warn">
                      <p className="font-medium">Bearer invoice</p>
                      <p className="mt-1 text-signal-warn/90">
                        Anyone holding this link can claim. Funds will withdraw to{" "}
                        <span className="font-mono">
                          {truncateAddress(wallet.publicKey.toBase58())}
                        </span>
                        — the wallet you have connected right now. Switch wallets first if you want a
                        different destination.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
                      <CheckCircle2 className="h-4 w-4" />
                      Correct wallet connected · proceed when ready
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-ink-subtle">
                      Destination:&nbsp;
                      <Address value={wallet.publicKey.toBase58()} chars={6} />
                    </div>
                    <Button
                      onClick={handleClaim}
                      disabled={claiming}
                      className="w-full sm:w-auto"
                    >
                      {claiming ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Claiming…
                        </>
                      ) : (
                        "Claim funds"
                      )}
                    </Button>
                  </div>
                </>
              )}

              {error ? (
                <div className="rounded-md border border-signal-danger/30 bg-signal-danger/10 p-3 text-sm text-signal-danger">
                  {error}
                </div>
              ) : null}
            </div>
        </div>
      </section>
    </main>
  );
}

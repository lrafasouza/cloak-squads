"use client";

import { ProofGenerationState, type ProofStepId } from "@/components/proof/ProofGenerationState";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { createIssueLicenseProposal } from "@/lib/squads-sdk";
import { solAmountToLamports } from "@cloak-squads/core/amount";
import { assertCofreInitialized } from "@cloak-squads/core/cofre-status";
import { computePayloadHash } from "@cloak-squads/core/hashing";
import type { PayloadInvariants } from "@cloak-squads/core/types";
import {
  NATIVE_SOL_MINT,
  computeUtxoCommitment,
  createUtxo,
  generateUtxoKeypair,
} from "@cloak.dev/sdk-devnet";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, use, useMemo, useState } from "react";

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export default function InvoicePage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { addToast } = useToast();

  const [invoiceRef, setInvoiceRef] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [recipientWallet, setRecipientWallet] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [proofStep, setProofStep] = useState<ProofStepId | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<{
    claimUrl: string;
    transactionIndex: string;
  } | null>(null);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowConfirm(true);
  }

  async function executeCreate() {
    setShowConfirm(false);
    setError(null);
    setResult(null);
    setPending(true);
    setProofStep("load-circuits");

    try {
      if (!multisigAddress) throw new Error("Invalid multisig address.");
      if (!wallet.publicKey) throw new Error("Connect a multisig member wallet first.");

      await assertCofreInitialized({
        connection,
        multisig: multisigAddress,
        gatekeeperProgram: new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
      });

      const lamports = solAmountToLamports(amount);
      const recipientPubkey = new PublicKey(recipientWallet.trim());

      setProofStep("generate-witness");

      // Step 1: Create StealthInvoice in DB (server generates nacl keypair + claim URL)
      const stealthRes = await fetch("/api/stealth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          invoiceRef: invoiceRef.trim() || undefined,
          memo: memo.trim() || undefined,
          amount: lamports.toString(),
          recipientWallet: recipientPubkey.toBase58(),
        }),
      });
      if (!stealthRes.ok) {
        const data = (await stealthRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to create stealth invoice.");
      }
      const stealthData = (await stealthRes.json()) as {
        id: string;
        stealthPubkey: string;
        claimUrl: string;
      };

      // Step 2: Generate Cloak UTXO commitment
      const keypair = await generateUtxoKeypair();
      const mint = NATIVE_SOL_MINT;
      const utxo = await createUtxo(lamports, keypair, mint);
      const commitmentBigInt = await computeUtxoCommitment(utxo);
      const commitment = commitmentBigInt.toString(16).padStart(64, "0");

      // Use recipientWallet as recipientVkPub so operator can match invoice via
      // recipientWallet === loadedDraft.recipient (operator/page.tsx line ~423)
      const invariants: PayloadInvariants = {
        nullifier: randomBytes(32),
        commitment: hexToBytes(commitment),
        amount: lamports,
        tokenMint: mint,
        recipientVkPub: recipientPubkey.toBytes(),
        nonce: randomBytes(16),
      };

      setProofStep("prove");

      // Step 3: Build gatekeeper instruction + Squads proposal
      const hash = computePayloadHash(invariants);
      const { instruction } = await buildIssueLicenseIxBrowser({
        multisig: multisigAddress,
        payloadHash: hash,
        nonce: invariants.nonce,
      });
      const proposalResult = await createIssueLicenseProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        issueLicenseIx: instruction,
        memo: memo.trim()
          ? `stealth invoice: ${memo.trim()}`
          : `stealth invoice ${stealthData.id.slice(0, 8)}`,
      });

      const transactionIndex = proposalResult.transactionIndex.toString();
      const claim = {
        invoiceId: stealthData.id,
        amount: invariants.amount.toString(),
        keypairPrivateKey: keypair.privateKey.toString(16).padStart(64, "0"),
        keypairPublicKey: keypair.publicKey.toString(16).padStart(64, "0"),
        blinding: utxo.blinding.toString(16).padStart(64, "0"),
        commitment,
        recipient_vk: recipientPubkey.toBase58(),
        token_mint: mint.toBase58(),
      };

      // Step 4: Persist ProposalDraft (recipient = recipientWallet for operator lookup)
      const draftRes = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          transactionIndex,
          amount: lamports.toString(),
          recipient: recipientPubkey.toBase58(),
          memo: memo.trim() || undefined,
          payloadHash: Array.from(hash),
          invariants: {
            nullifier: Array.from(invariants.nullifier),
            commitment: Array.from(invariants.commitment),
            amount: invariants.amount.toString(),
            tokenMint: invariants.tokenMint.toBase58(),
            recipientVkPub: Array.from(invariants.recipientVkPub),
            nonce: Array.from(invariants.nonce),
          },
          commitmentClaim: claim,
          signature: proposalResult.signature,
        }),
      });
      if (!draftRes.ok) {
        const body = (await draftRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not persist proposal draft.");
      }

      // Step 5: Cache claim secrets in sessionStorage (never sent to server)
      try {
        sessionStorage.setItem(
          `claim:${multisigAddress.toBase58()}:${transactionIndex}`,
          JSON.stringify(claim),
        );
      } catch {
        /* sessionStorage full or unavailable */
      }

      addToast("Invoice + proposal created!", "success");
      setResult({ claimUrl: stealthData.claimUrl, transactionIndex });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not create stealth invoice.";
      setError(message);
      addToast(message, "error");
    } finally {
      setPending(false);
      setProofStep(null);
    }
  }

  const handleCopyClaimUrl = async () => {
    if (!result) return;
    const fullUrl = `${window.location.origin}${result.claimUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    addToast("Claim link copied!", "success");
  };

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/"
          className="text-sm text-accent hover:text-accent transition-colors"
        >
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

  // After success: show claim URL + link to proposal (don't auto-redirect, user must copy first)
  if (result) {
    const fullClaimUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${result.claimUrl}`;
    return (
      <main className="min-h-screen">
        <header className="border-b border-border bg-bg/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href={`/vault/${multisigAddress.toBase58()}`}
              className="text-sm font-semibold text-ink"
            >
              Cofre
            </Link>
            <ClientWalletButton />
          </div>
        </header>

        <section className="mx-auto max-w-xl px-4 py-12 md:px-6">
          <div className="rounded-xl border border-accent/20 bg-accent-soft p-6">
            <div className="flex items-center gap-3 mb-4">
              <svg
                aria-hidden="true"
                className="h-6 w-6 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <h1 className="text-lg font-semibold text-accent">Invoice created</h1>
            </div>

            <div className="grid gap-4">
              <div className="rounded-lg bg-accent-soft p-4">
                <p className="text-xs font-medium text-accent mb-1">
                  Claim link — send to recipient
                </p>
                <p className="break-all font-mono text-xs text-accent leading-relaxed">
                  {fullClaimUrl}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={handleCopyClaimUrl}
                >
                  Copy claim link
                </Button>
              </div>

              <p className="text-sm text-ink-muted">
                Copy the claim link before continuing. The recipient needs it to withdraw funds
                after the proposal is executed.
              </p>

              <Button
                type="button"
                onClick={() =>
                  router.push(
                    `/vault/${multisigAddress.toBase58()}/proposals/${result.transactionIndex}`,
                  )
                }
              >
                Go to proposal #{result.transactionIndex} →
              </Button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-bg via-bg to-surface">
      <header className="border-b border-border/50 bg-bg/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href={`/vault/${multisigAddress.toBase58()}`}
            className="flex items-center gap-2 text-sm font-semibold text-ink hover:text-accent transition-colors"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-1.5 mb-3">
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="text-sm font-medium text-accent">F4 stealth invoice</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold text-ink">Create payment request</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Creates a private invoice and a Squads proposal in one step. After approval and
            execution, the recipient uses the claim link to withdraw funds privately.
          </p>
        </div>

        <div className="grid gap-4">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1"
          >
            <div className="grid gap-4">
              <div>
                <Label htmlFor="invoiceRef">Invoice reference</Label>
                <Input
                  id="invoiceRef"
                  type="text"
                  autoComplete="off"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="Optional reference number"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="memo">Memo</Label>
                <Input
                  id="memo"
                  type="text"
                  autoComplete="off"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Optional description"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="amount">Amount (SOL)</Label>
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.5"
                  className="mt-1.5 font-mono"
                />
              </div>

              <div>
                <Label htmlFor="recipient">Recipient wallet</Label>
                <Input
                  id="recipient"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={recipientWallet}
                  onChange={(e) => setRecipientWallet(e.target.value)}
                  placeholder="Solana wallet address"
                  className="mt-1.5 font-mono"
                />
              </div>

              <Button
                type="submit"
                disabled={pending || !amount || !recipientWallet || !wallet.publicKey}
                className="w-full"
              >
                {pending ? "Creating invoice..." : "Create invoice + proposal"}
              </Button>

              {!wallet.publicKey ? (
                <p className="text-xs text-amber-300">Connect a multisig member wallet first.</p>
              ) : null}
            </div>

            {error ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-signal-danger/30 bg-signal-danger/15 px-4 py-3">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-signal-danger"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-signal-danger">{error}</p>
              </div>
            ) : null}
          </form>

          <ProofGenerationState currentStep={proofStep} complete={false} error={error} />
        </div>
      </section>

      <ConfirmModal
        open={showConfirm}
        title="Create Invoice + Proposal"
        description={`This will create a stealth invoice and a Squads proposal for ${amount} SOL. The proposal will require multisig approval before the operator can execute the private transfer.`}
        confirmText="Create"
        cancelText="Cancel"
        onConfirm={executeCreate}
        onCancel={() => setShowConfirm(false)}
        isLoading={pending}
      />
    </main>
  );
}

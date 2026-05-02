"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { ArrowLeft, Send } from "lucide-react";
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { createIssueLicenseProposal, createVaultProposal } from "@/lib/squads-sdk";
import { useWalletAuth } from "@/lib/use-wallet-auth";
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
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, use, useMemo, useState } from "react";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export default function SendPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [sendMode, setSendMode] = useState<"private" | "public">("private");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const gatekeeperProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmChecked(false);
    setPending(true);
    startTransaction({
      title: "Creating private send proposal",
      description: "Preparing the encrypted transfer claim and opening a Squads proposal.",
      steps: [
        {
          id: "validate",
          title: "Validate transfer",
          description: "Checking wallet, recipient, amount, and vault readiness.",
        },
        {
          id: "commitment",
          title: "Build private commitment",
          description: "Creating the Cloak UTXO and payload hash signers will approve.",
        },
        {
          id: "squads",
          title: "Create Squads proposal",
          description: "Your wallet signs the transaction that opens the proposal.",
        },
        {
          id: "persist",
          title: "Save execution draft",
          description: "Saving the private execution data needed by the operator.",
        },
      ],
    });

    try {
      if (!wallet.publicKey || !multisigAddress) {
        throw new Error("Connect a wallet and open a valid multisig.");
      }

      const recipientPubkey = new PublicKey(recipient);
      const lamports = solAmountToLamports(amount);

      await assertCofreInitialized({
        connection,
        multisig: multisigAddress,
        gatekeeperProgram,
      });
      updateStep("validate", { status: "success" });
      updateStep("commitment", { status: "running" });

      const keypair = await generateUtxoKeypair();
      const mint = NATIVE_SOL_MINT;
      const utxo = await createUtxo(lamports, keypair, mint);
      const commitmentBigInt = await computeUtxoCommitment(utxo);
      const commitmentHex = commitmentBigInt.toString(16).padStart(64, "0");

      const invariants: PayloadInvariants = {
        nullifier: randomBytes(32),
        commitment: hexToBytes(commitmentHex),
        amount: lamports,
        tokenMint: mint,
        recipientVkPub: recipientPubkey.toBytes(),
        nonce: randomBytes(16),
      };

      const payloadHash = computePayloadHash(invariants);
      updateStep("commitment", { status: "success" });
      updateStep("squads", { status: "running" });

      const { instruction } = await buildIssueLicenseIxBrowser({
        multisig: multisigAddress,
        payloadHash,
        nonce: invariants.nonce,
      });

      const result = await createIssueLicenseProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        issueLicenseIx: instruction,
        memo: "issue license",
      });
      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${result.transactionIndex.toString()} created on-chain.`,
      });
      updateStep("persist", { status: "running" });

      const transactionIndex = result.transactionIndex.toString();

      const keypairPrivateKey = keypair.privateKey.toString(16).padStart(64, "0");
      const keypairPublicKey = keypair.publicKey.toString(16).padStart(64, "0");
      const blinding = utxo.blinding.toString(16).padStart(64, "0");

      const commitmentClaim = {
        amount: lamports.toString(),
        keypairPrivateKey,
        keypairPublicKey,
        blinding,
        commitment: commitmentHex,
        recipient_vk: recipientPubkey.toBase58(),
        token_mint: mint.toBase58(),
      };

      try {
        sessionStorage.setItem(
          `send-claim:${multisig}:${transactionIndex}`,
          JSON.stringify(commitmentClaim),
        );
      } catch {
        /* sessionStorage unavailable */
      }

      const draftResponse = await fetchWithAuth("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          transactionIndex,
          amount: lamports.toString(),
          recipient: recipientPubkey.toBase58(),
          memo: memo || undefined,
          payloadHash: Array.from(payloadHash),
          invariants: {
            nullifier: Array.from(invariants.nullifier),
            commitment: Array.from(invariants.commitment),
            amount: lamports.toString(),
            tokenMint: mint.toBase58(),
            recipientVkPub: Array.from(invariants.recipientVkPub),
            nonce: Array.from(invariants.nonce),
          },
          commitmentClaim,
        }),
      });

      if (!draftResponse.ok) {
        const body = (await draftResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not persist proposal draft.");
      }

      updateStep("persist", { status: "success" });
      completeTransaction({
        title: "Private send proposal ready",
        description: `Proposal #${transactionIndex} is ready for signer approval.`,
      });
      router.push(`/vault/${multisig}/proposals/${transactionIndex}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not create proposal.";
      setError(message);
      failTransaction(message);
      setPending(false);
    }
  }

  async function handlePublicSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmChecked(false);
    setPending(true);
    startTransaction({
      title: "Creating public send proposal",
      description: "Opening a standard Squads vault transfer proposal.",
      steps: [
        { id: "validate", title: "Validate transfer", description: "Checking wallet and recipient." },
        { id: "squads", title: "Create Squads proposal", description: "Your wallet signs the vault transaction." },
      ],
    });

    try {
      if (!wallet.publicKey || !multisigAddress || !wallet.sendTransaction) {
        throw new Error("Connect a wallet and open a valid multisig.");
      }

      const recipientPubkey = new PublicKey(recipient);
      const lamports = solAmountToLamports(amount);
      const [vaultPda] = multisigSdk.getVaultPda({ multisigPda: multisigAddress, index: 0 });

      updateStep("validate", { status: "success" });
      updateStep("squads", { status: "running" });

      const transferIx = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: recipientPubkey,
        lamports,
      });

      const result = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: [transferIx],
        memo: memo || "Public send",
      });

      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${result.transactionIndex.toString()} created.`,
      });
      completeTransaction({
        title: "Public send proposal ready",
        description: `Proposal #${result.transactionIndex.toString()} is ready for signer approval.`,
      });
      router.push(`/vault/${multisig}/proposals/${result.transactionIndex.toString()}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not create proposal.";
      setError(message);
      failTransaction(message);
      setPending(false);
    }
  }

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-accent transition-colors hover:text-accent-hover">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="PRIVATE SEND"
          title="Settle privately"
          description="Create a sealed transfer through your Squads vault. The recipient address stays unlinkable on-chain."
        />

        <div>
          {/* Mode toggle */}
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            {(["private", "public"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSendMode(mode)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  sendMode === mode
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {mode === "private" ? "Private Send" : "Public Send"}
              </button>
            ))}
          </div>

          <Panel className="mt-4">
            <PanelHeader
              icon={Send}
              title="Transfer details"
              description={
                sendMode === "private"
                  ? "Funds are routed through the shielded pool — the recipient address stays unlinkable on-chain."
                  : "Public send creates a standard Squads vault transfer visible to all signers on-chain."
              }
            />
            <PanelBody>
              <form onSubmit={sendMode === "private" ? handleSubmit : handlePublicSend} className="space-y-4">
                <div>
                  <Label htmlFor="recipient">Recipient</Label>
                  <Input
                    id="recipient"
                    type="text"
                    placeholder="Solana wallet address"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="mt-1.5 font-mono"
                    required
                    disabled={pending}
                  />
                </div>

                <div>
                  <Label htmlFor="amount">Amount (SOL)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.000000001"
                    min="0.000000001"
                    placeholder="0.1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1.5 font-mono"
                    required
                    disabled={pending}
                  />
                </div>

                <div>
                  <Label htmlFor="memo">Memo (optional)</Label>
                  <Input
                    id="memo"
                    type="text"
                    placeholder="Internal reference"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="mt-1.5"
                    disabled={pending}
                  />
                </div>

                {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

                {sendMode === "public" && (
                  <InlineAlert tone="info">
                    Creates a standard Squads vault transfer. The recipient and amount will be visible on-chain.
                  </InlineAlert>
                )}

                <label className="flex items-start gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                  />
                  I confirm the recipient and amount are correct before creating this proposal.
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={`/vault/${multisig}`}
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-border-strong bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Link>
                  {!pending && (
                    <Button
                      type="submit"
                      disabled={!confirmChecked || !wallet.publicKey}
                      className="w-full sm:w-auto"
                    >
                      {sendMode === "private"
                        ? "Create private send"
                        : "Create public send"}
                    </Button>
                  )}
                </div>

                {!wallet.publicKey ? (
                  <p className="text-xs text-signal-warn">
                    Connect a wallet to create a proposal.
                  </p>
                ) : null}
              </form>
            </PanelBody>
          </Panel>
        </div>

      </div>
    </WorkspacePage>
  );
}

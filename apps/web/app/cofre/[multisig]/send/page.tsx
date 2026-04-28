"use client";

import { ProofGenerationState, type ProofStepId } from "@/components/proof/ProofGenerationState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast-provider";
import { StaggerContainer, StaggerItem } from "@/components/ui/animations";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { createIssueLicenseProposal } from "@/lib/squads-sdk";
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

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export default function SendPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { addToast } = useToast();
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payloadHash, setPayloadHash] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [proofStep, setProofStep] = useState<ProofStepId | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  async function createProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowConfirm(true);
  }

  async function executeProposal() {
    setShowConfirm(false);
    setError(null);
    setPayloadHash(null);
    setPending(true);
    setProofStep("load-circuits");

    try {
      if (!wallet.publicKey || !multisigAddress) {
        throw new Error("Connect a wallet and open a valid multisig.");
      }

      if (!/^[0-9]+$/.test(amount) || BigInt(amount) <= 0n) {
        throw new Error("Amount must be a positive integer in lamports.");
      }

      const recipientPubkey = new PublicKey(recipient.trim());
      setProofStep("generate-witness");

      // Generate real Cloak UTXO commitment
      const keypair = await generateUtxoKeypair();
      const mint = NATIVE_SOL_MINT;
      const utxo = await createUtxo(BigInt(amount), keypair, mint);
      const commitmentBigInt = await computeUtxoCommitment(utxo);
      const commitment = commitmentBigInt.toString(16).padStart(64, "0");

      const note = {
        commitment,
        keypairPrivateKey: keypair.privateKey.toString(16).padStart(64, "0"),
        keypairPublicKey: keypair.publicKey.toString(16).padStart(64, "0"),
        blinding: utxo.blinding.toString(16).padStart(64, "0"),
        tokenMint: mint.toBase58(),
      };
      const invariants: PayloadInvariants = {
        nullifier: randomBytes(32),
        commitment: hexToBytes(commitment),
        amount: BigInt(amount),
        tokenMint: mint,
        recipientVkPub: recipientPubkey.toBytes(),
        nonce: randomBytes(16),
      };

      setProofStep("prove");
      const hash = computePayloadHash(invariants);
      const { instruction } = await buildIssueLicenseIxBrowser({
        multisig: multisigAddress,
        payloadHash: hash,
        nonce: invariants.nonce,
      });
      const result = await createIssueLicenseProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        issueLicenseIx: instruction,
        memo: memo ? `issue license: ${memo}` : "issue license",
      });

      const transactionIndex = result.transactionIndex.toString();
      const claim = {
        amount: invariants.amount.toString(),
        keypairPrivateKey: note.keypairPrivateKey,
        keypairPublicKey: note.keypairPublicKey,
        blinding: note.blinding,
        commitment: commitment,
        recipient_vk: recipientPubkey.toBase58(),
        token_mint: mint.toBase58(),
      };
      const draft = {
        cofreAddress: multisigAddress.toBase58(),
        transactionIndex,
        amount,
        recipient: recipientPubkey.toBase58(),
        memo,
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
        signature: result.signature,
      };
      const draftResponse = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!draftResponse.ok) {
        const body = (await draftResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not persist proposal draft.");
      }

      setPayloadHash(bytesToHex(hash));
      addToast("Proposal created successfully!", "success");

      try {
        sessionStorage.setItem(
          `claim:${multisigAddress.toBase58()}:${transactionIndex}`,
          JSON.stringify(claim),
        );
      } catch {
        /* sessionStorage full or unavailable */
      }

      router.push(`/cofre/${multisigAddress.toBase58()}/proposals/${transactionIndex}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not create proposal.";
      setError(message);
      addToast(message, "error");
    } finally {
      setPending(false);
      setProofStep(null);
    }
  }

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-neutral-50">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900">
      <header className="border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href={`/cofre/${multisigAddress.toBase58()}`}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-100 hover:text-emerald-400 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <StaggerContainer staggerDelay={0.1}>
          <StaggerItem>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/50 bg-emerald-950/30 px-4 py-1.5 mb-3">
                <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span className="text-sm font-medium text-emerald-300">F1 private send</span>
              </div>
              <h1 className="mt-2 text-3xl font-bold text-neutral-50">Create license proposal</h1>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                Build the gatekeeper license instruction, wrap it in a Squads vault transaction, and
                create the proposal for signer approval.
              </p>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="grid gap-4">
              <form
                onSubmit={createProposal}
                className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm p-5 shadow-xl"
              >
                <StaggerContainer className="grid gap-4" staggerDelay={0.05}>
                  <StaggerItem>
                    <div>
                      <Label htmlFor="amount">Amount in lamports</Label>
                      <Input
                        id="amount"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="1000000"
                        className="mt-1.5 font-mono"
                      />
                    </div>
                  </StaggerItem>

                  <StaggerItem>
                    <div>
                      <Label htmlFor="recipient">Recipient stealth pubkey</Label>
                      <Input
                        id="recipient"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={recipient}
                        onChange={(event) => setRecipient(event.target.value)}
                        placeholder="32-byte recipient public key"
                        className="mt-1.5 font-mono"
                      />
                    </div>
                  </StaggerItem>

                  <StaggerItem>
                    <div>
                      <Label htmlFor="memo">Memo</Label>
                      <Input
                        id="memo"
                        type="text"
                        autoComplete="off"
                        value={memo}
                        onChange={(event) => setMemo(event.target.value)}
                        placeholder="Optional"
                        className="mt-1.5"
                      />
                    </div>
                  </StaggerItem>

                  <StaggerItem>
                    <Button type="submit" disabled={pending || !amount || !recipient} className="w-full">
                      {pending ? "Creating proposal..." : "Create proposal"}
                    </Button>
                  </StaggerItem>
                </StaggerContainer>

                {error ? (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3">
                    <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                ) : null}

                {payloadHash ? (
                  <div className="mt-4 rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-sm font-semibold text-emerald-300">Payload hash</p>
                    </div>
                    <p className="break-all font-mono text-xs text-emerald-200 bg-emerald-950/50 rounded-lg px-3 py-2">{payloadHash}</p>
                  </div>
                ) : null}
              </form>

              <ProofGenerationState
                currentStep={proofStep}
                complete={Boolean(payloadHash)}
                error={error}
              />
            </div>
          </StaggerItem>
        </StaggerContainer>
      </section>

      <ConfirmModal
        open={showConfirm}
        title="Create License Proposal"
        description={`This will create a Squads proposal to issue a license for ${Number(amount).toLocaleString()} lamports. The transaction will require approval from the multisig members before execution.`}
        confirmText="Create Proposal"
        cancelText="Cancel"
        onConfirm={executeProposal}
        onCancel={() => setShowConfirm(false)}
        isLoading={pending}
      />
    </main>
  );
}

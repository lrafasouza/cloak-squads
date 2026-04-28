"use client";

import { ProofGenerationState, type ProofStepId } from "@/components/proof/ProofGenerationState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
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
import { PublicKey, SystemProgram } from "@solana/web3.js";
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
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payloadHash, setPayloadHash] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [proofStep, setProofStep] = useState<ProofStepId | null>(null);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  async function createProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setError(caught instanceof Error ? caught.message : "Could not create proposal.");
    } finally {
      setPending(false);
      setProofStep(null);
    }
  }

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-emerald-300">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-neutral-50">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href={`/cofre/${multisigAddress.toBase58()}`}
            className="text-sm font-semibold text-neutral-100"
          >
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-emerald-300">F1 private send</p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Create license proposal</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Build the gatekeeper license instruction, wrap it in a Squads vault transaction, and
            create the proposal for signer approval.
          </p>
        </div>

        <div className="grid gap-4">
          <form
            onSubmit={createProposal}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 md:p-5"
          >
            <div className="grid gap-4">
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
                  className="mt-1 font-mono"
                />
              </div>

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
                  className="mt-1 font-mono"
                />
              </div>

              <div>
                <Label htmlFor="memo">Memo</Label>
                <Input
                  id="memo"
                  type="text"
                  autoComplete="off"
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>

              <Button type="submit" disabled={pending}>
                {pending ? "Creating proposal..." : "Create proposal"}
              </Button>
            </div>

            {error ? (
              <p className="mt-4 rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            {payloadHash ? (
              <div className="mt-4 rounded-md border border-emerald-900 bg-emerald-950 p-3">
                <p className="text-sm font-medium text-emerald-200">Payload hash</p>
                <p className="mt-2 break-all font-mono text-xs text-emerald-100">{payloadHash}</p>
              </div>
            ) : null}
          </form>

          <ProofGenerationState
            currentStep={proofStep}
            complete={Boolean(payloadHash)}
            error={error}
          />
        </div>
      </section>
    </main>
  );
}

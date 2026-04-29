"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { useWalletAuth } from "@/lib/use-wallet-auth";
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

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setPending(true);

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

      router.push(`/vault/${multisig}/proposals/${transactionIndex}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create proposal.");
      setPending(false);
    }
  }

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-accent">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

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

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-accent">Private Send</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Send SOL privately</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Enter a recipient wallet and amount. A Squads proposal will be created for signer
            approval. Once executed, the operator delivers SOL directly to the recipient via the
            shielded pool — no claim needed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="rounded-lg border border-border bg-surface p-4 md:p-5">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="recipient">Recipient</Label>
                <Input
                  id="recipient"
                  type="text"
                  placeholder="Solana wallet address"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="mt-1 font-mono"
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
                  className="mt-1 font-mono"
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
                  className="mt-1"
                  disabled={pending}
                />
              </div>

              {error ? (
                <p className="rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-3">
                <Link
                  href={`/vault/${multisigAddress.toBase58()}`}
                  className="inline-flex items-center justify-center rounded-md border border-border-strong bg-transparent px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
                >
                  Back
                </Link>
                <Button type="submit" disabled={pending || !wallet.publicKey}>
                  {pending ? "Creating proposal..." : "Create send proposal"}
                </Button>
              </div>

              {!wallet.publicKey ? (
                <p className="text-xs text-amber-300">Connect a wallet to create a proposal.</p>
              ) : null}
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}

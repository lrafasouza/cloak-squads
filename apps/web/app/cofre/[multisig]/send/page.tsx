"use client";

import { computePayloadHash } from "@cloak-squads/core/hashing";
import { cofrePda, squadsVaultPda } from "@cloak-squads/core/pda";
import type { PayloadInvariants } from "@cloak-squads/core/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import Link from "next/link";
import { type FormEvent, use, useMemo, useState } from "react";

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function SendPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payloadHash, setPayloadHash] = useState<string | null>(null);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const cofre = useMemo(
    () => (multisigAddress ? cofrePda(multisigAddress)[0] : null),
    [multisigAddress],
  );
  const vault = useMemo(
    () => (multisigAddress ? squadsVaultPda(multisigAddress)[0] : null),
    [multisigAddress],
  );

  function prepareLicense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPayloadHash(null);

    if (!wallet.publicKey || !multisigAddress || !cofre || !vault) {
      setError("Connect a wallet and open a valid multisig.");
      return;
    }

    if (!/^[0-9]+$/.test(amount) || BigInt(amount) <= 0n) {
      setError("Amount must be a positive integer in lamports.");
      return;
    }

    try {
      new PublicKey(recipient);
    } catch {
      setError("Recipient must be a valid Solana public key for this scaffold.");
      return;
    }

    const invariants: PayloadInvariants = {
      nullifier: randomBytes(32),
      commitment: randomBytes(32),
      amount: BigInt(amount),
      tokenMint: SystemProgram.programId,
      recipientVkPub: randomBytes(32),
      nonce: randomBytes(16),
    };

    setPayloadHash(toHex(computePayloadHash(invariants)));
  }

  if (!multisigAddress || !cofre || !vault) {
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
            className="rounded-md text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Cofre
          </Link>
          <WalletMultiButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-emerald-300">F1 private send</p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Prepare license proposal</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            This scaffold computes the payload hash that the Squads proposal will approve before the
            operator submits the separate Cloak execution transaction.
          </p>
        </div>

        <form
          onSubmit={prepareLicense}
          className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 md:p-5"
        >
          <div className="grid gap-4">
            <div>
              <label htmlFor="amount" className="text-sm font-medium text-neutral-100">
                Amount in lamports
              </label>
              <input
                id="amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="1000000"
                className="mt-1 min-h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
            </div>

            <div>
              <label htmlFor="recipient" className="text-sm font-medium text-neutral-100">
                Recipient
              </label>
              <input
                id="recipient"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="Recipient public key"
                className="mt-1 min-h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
            </div>

            <div>
              <label htmlFor="memo" className="text-sm font-medium text-neutral-100">
                Memo
              </label>
              <input
                id="memo"
                type="text"
                autoComplete="off"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Optional"
                className="mt-1 min-h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
            </div>

            <button
              type="submit"
              className="min-h-10 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
            >
              Compute payload hash
            </button>
          </div>

          {error ? (
            <p className="mt-4 rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          {payloadHash ? (
            <div className="mt-4 rounded-md border border-emerald-900 bg-emerald-950 p-3">
              <p className="text-sm font-medium text-emerald-200">Payload hash ready</p>
              <p className="mt-2 break-all font-mono text-xs text-emerald-100">{payloadHash}</p>
            </div>
          ) : null}
        </form>
      </section>
    </main>
  );
}

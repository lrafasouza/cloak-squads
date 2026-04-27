"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useCallback } from "react";

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function HomePage() {
  const router = useRouter();
  const wallet = useWallet();
  const [manualAddress, setManualAddress] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const canSubmitManual = useMemo(() => manualAddress.trim().length > 0, [manualAddress]);

  const openManualCofre = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError(null);
    try {
      const pubkey = new PublicKey(manualAddress.trim());
      router.push(`/cofre/${pubkey.toBase58()}`);
    } catch {
      setManualError("Enter a valid Solana address.");
    }
  }, [manualAddress, router]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href="/" className="rounded-md text-sm font-semibold tracking-wide text-neutral-100">
            Cloak Squads
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-12 md:px-6">
        <div className="space-y-8">
          <div className="text-center">
            <p className="text-sm font-medium text-emerald-300">Devnet</p>
            <h1 className="mt-3 text-3xl font-semibold text-neutral-50 md:text-4xl">
              Open a Squads multisig
            </h1>
            <p className="mt-3 text-sm text-neutral-400">
              Enter your multisig address to manage private execution.
            </p>
          </div>

          <form onSubmit={openManualCofre} className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <label htmlFor="manual-multisig" className="text-sm font-medium text-neutral-100">
              Multisig address
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                id="manual-multisig"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder="e.g. SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"
                className="min-h-10 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
              <button
                type="submit"
                disabled={!canSubmitManual}
                className="min-h-10 rounded-md bg-emerald-400 px-6 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              >
                Open
              </button>
            </div>
            {manualError && (
              <p className="mt-2 text-sm text-red-300">{manualError}</p>
            )}
          </form>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold text-neutral-100">Don't have a multisig?</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Create one on</p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">1.</span>
                <span className="text-neutral-300">Go to</span>
                <a 
                  href="https://devnet.squads.so" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-emerald-300 hover:text-emerald-200"
                >
                  devnet.squads.so
                </a>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">2.</span>
                <span className="text-neutral-300">Connect your wallet</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">3.</span>
                <span className="text-neutral-300">Create a new multisig (1-of-1 is fine for testing)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">4.</span>
                <span className="text-neutral-300">Copy the multisig address and paste it above</span>
              </div>
            </div>
          </div>

          {wallet.connected && wallet.publicKey && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <h2 className="text-sm font-semibold text-neutral-100">Your wallet</h2>
              <p className="mt-2 font-mono text-sm text-neutral-300">{wallet.publicKey.toBase58()}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

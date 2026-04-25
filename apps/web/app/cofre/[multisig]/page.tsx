"use client";

import { cofrePda, squadsVaultPda } from "@cloak-squads/core/pda";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useMemo } from "react";

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function CofreDashboardPage({ params }: { params: { multisig: string } }) {
  const wallet = useWallet();

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(params.multisig);
    } catch {
      return null;
    }
  }, [params.multisig]);

  const cofre = useMemo(() => {
    if (!multisigAddress) {
      return null;
    }
    return cofrePda(multisigAddress)[0];
  }, [multisigAddress]);

  const vault = useMemo(() => {
    if (!multisigAddress) {
      return null;
    }
    return squadsVaultPda(multisigAddress)[0];
  }, [multisigAddress]);

  if (!multisigAddress || !cofre || !vault) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/"
          className="text-sm text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-neutral-50">Invalid multisig address</h1>
        <p className="mt-2 text-sm text-neutral-300">Check the address and open the cofre again.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="rounded-md text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Cloak Squads
          </Link>
          <WalletMultiButton />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-300">Cofre dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-neutral-50">
              {truncateAddress(multisigAddress.toBase58())}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">
              Prepare private sends, review pending approvals, and monitor the shielded execution
              state for this Squads vault.
            </p>
          </div>

          <Link
            href={`/cofre/${multisigAddress.toBase58()}/send`}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Prepare send
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Shielded balance</p>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-neutral-50">
              -- SOL
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              Cloak scan integration lands in the F1 operator flow.
            </p>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Pending proposals</p>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-neutral-50">0</p>
            <p className="mt-2 text-xs text-neutral-400">
              Squads proposal indexing is not seeded yet.
            </p>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Connected wallet</p>
            <p className="mt-3 break-all font-mono text-sm text-neutral-50">
              {wallet.publicKey ? truncateAddress(wallet.publicKey.toBase58()) : "Not connected"}
            </p>
            <p className="mt-2 text-xs text-neutral-400">Devnet execution context.</p>
          </section>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 p-4">
              <h2 className="text-base font-semibold text-neutral-50">Addresses</h2>
            </div>
            <dl className="space-y-4 p-4 text-sm">
              <div>
                <dt className="text-neutral-400">Multisig</dt>
                <dd className="mt-1 break-all font-mono text-neutral-100">
                  {multisigAddress.toBase58()}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-400">Cofre PDA</dt>
                <dd className="mt-1 break-all font-mono text-neutral-100">{cofre.toBase58()}</dd>
              </div>
              <div>
                <dt className="text-neutral-400">Vault PDA</dt>
                <dd className="mt-1 break-all font-mono text-neutral-100">{vault.toBase58()}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 p-4">
              <h2 className="text-base font-semibold text-neutral-50">Activity</h2>
            </div>
            <div className="p-4 text-sm text-neutral-300">
              No private execution activity indexed for this cofre yet.
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

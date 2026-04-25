"use client";

// biome-ignore lint/style/useNodejsImportProtocol: Client bundle uses the buffer package polyfill.
import { Buffer } from "buffer";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { type Connection, PublicKey } from "@solana/web3.js";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import * as multisig from "@sqds/multisig";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

type CofreOption = {
  address: string;
  threshold: number;
  members: number;
  transactionIndex: string;
};

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

async function listWalletMultisigs(connection: Connection, owner: PublicKey) {
  const programAccounts = await connection.getProgramAccounts(multisig.PROGRAM_ID);

  return programAccounts
    .flatMap(({ pubkey, account }) => {
      try {
        const [decoded] = multisig.accounts.Multisig.fromAccountInfo({
          ...account,
          data: Buffer.from(account.data),
        });
        const isMember = decoded.members.some((member) => member.key.equals(owner));
        if (!isMember) {
          return [];
        }

        return [
          {
            address: pubkey.toBase58(),
            threshold: decoded.threshold,
            members: decoded.members.length,
            transactionIndex: decoded.transactionIndex.toString(),
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, 12);
}

export default function HomePage() {
  const router = useRouter();
  const wallet = useWallet();
  const { connection } = useConnection();
  const [manualAddress, setManualAddress] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const multisigsQuery = useQuery({
    queryKey: ["wallet-multisigs", wallet.publicKey?.toBase58()],
    queryFn: () => {
      if (!wallet.publicKey) {
        return Promise.resolve<CofreOption[]>([]);
      }
      return listWalletMultisigs(connection, wallet.publicKey);
    },
    enabled: false,
    staleTime: Infinity,
  });

  const canSubmitManual = useMemo(() => manualAddress.trim().length > 0, [manualAddress]);

  function openManualCofre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualError(null);

    try {
      const pubkey = new PublicKey(manualAddress.trim());
      router.push(`/cofre/${pubkey.toBase58()}`);
    } catch {
      setManualError("Enter a valid multisig address.");
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="rounded-md text-sm font-semibold tracking-wide text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Cloak Squads
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[1.1fr_0.9fr] md:px-6 md:py-10">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-emerald-300">Devnet cofre picker</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-normal text-neutral-50 md:text-4xl">
              Select a Squads multisig to manage private execution.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
              Connected wallets are matched against Squads v4 memberships. You can also paste a
              multisig address directly while local data is still being seeded.
            </p>
          </div>

          <form
            onSubmit={openManualCofre}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 md:p-5"
          >
            <label htmlFor="manual-multisig" className="text-sm font-medium text-neutral-100">
              Multisig address
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="manual-multisig"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={manualAddress}
                onChange={(event) => setManualAddress(event.target.value)}
                placeholder="SQDS multisig public key"
                aria-invalid={manualError ? "true" : undefined}
                aria-describedby={manualError ? "manual-multisig-error" : undefined}
                className="min-h-10 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
              <button
                type="submit"
                disabled={!canSubmitManual}
                className="min-h-10 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              >
                Open cofre
              </button>
            </div>
            {manualError ? (
              <p id="manual-multisig-error" className="mt-2 text-sm text-red-300">
                {manualError}
              </p>
            ) : (
              <p className="mt-2 text-xs text-neutral-400">
                Use the Squads multisig PDA, not the vault address.
              </p>
            )}
          </form>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 p-4">
            <h2 className="text-base font-semibold text-neutral-50">Your multisigs</h2>
            <p className="mt-1 text-sm text-neutral-400">Detected from the connected wallet.</p>
          </div>

          {!wallet.connected ? (
            <div className="p-4 text-sm text-neutral-300">
              Connect your wallet, then click "Scan memberships" to query devnet.
            </div>
          ) : multisigsQuery.isFetching ? (
            <div className="space-y-3 p-4" aria-busy="true">
              <div className="h-14 rounded-md bg-neutral-800" />
              <div className="h-14 rounded-md bg-neutral-800" />
              <div className="h-14 rounded-md bg-neutral-800" />
              <p className="text-xs text-neutral-400">
                Scanning the Squads program — this is a heavy public-RPC call and may take 30s+.
              </p>
            </div>
          ) : multisigsQuery.isError ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-red-300">Could not load Squads accounts from RPC.</p>
              <button
                type="button"
                onClick={() => multisigsQuery.refetch()}
                className="min-h-10 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Retry
              </button>
            </div>
          ) : multisigsQuery.data === undefined ? (
            <div className="space-y-3 p-4 text-sm text-neutral-300">
              <p>Memberships are not auto-fetched on devnet (heavy RPC).</p>
              <button
                type="button"
                onClick={() => multisigsQuery.refetch()}
                className="min-h-10 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Scan memberships
              </button>
            </div>
          ) : multisigsQuery.data?.length ? (
            <div className="divide-y divide-neutral-800">
              {multisigsQuery.data.map((item) => (
                <Link
                  key={item.address}
                  href={`/cofre/${item.address}`}
                  className="block p-4 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm text-neutral-100">
                      {truncateAddress(item.address)}
                    </span>
                    <span className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                      {item.threshold} of {item.members}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">
                    Last transaction index {item.transactionIndex}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-neutral-300">
              No Squads memberships found for this wallet on the current RPC.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

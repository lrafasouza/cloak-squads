"use client";

import { cofrePda, squadsVaultPda } from "@cloak-squads/core/pda";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { publicEnv } from "@/lib/env";

type DraftSummary = {
  id: string;
  transactionIndex: string;
  amount: string;
  recipient: string;
  memo: string;
  createdAt: string;
  type: "single" | "payroll";
  recipientCount?: number;
  totalAmount?: string;
};

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function CofreDashboardPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const wallet = useWallet();
  const gatekeeperProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
    [],
  );
  const squadsProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID),
    [],
  );

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const cofre = useMemo(() => {
    if (!multisigAddress) return null;
    return cofrePda(multisigAddress, gatekeeperProgram)[0];
  }, [gatekeeperProgram, multisigAddress]);

  const vault = useMemo(() => {
    if (!multisigAddress) return null;
    return squadsVaultPda(multisigAddress, squadsProgram)[0];
  }, [multisigAddress, squadsProgram]);

  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);

  const loadDrafts = useCallback(async () => {
    if (!multisigAddress) return;
    try {
      const [singleRes, payrollRes] = await Promise.all([
        fetch(`/api/proposals/${encodeURIComponent(multisigAddress.toBase58())}`),
        fetch(`/api/payrolls/${encodeURIComponent(multisigAddress.toBase58())}`),
      ]);

      const singleDrafts: DraftSummary[] = singleRes.ok
        ? ((await singleRes.json()) as DraftSummary[]).map((d) => ({ ...d, type: "single" as const }))
        : [];
      const payrollDrafts: DraftSummary[] = payrollRes.ok
        ? ((await payrollRes.json()) as DraftSummary[]).map((d) =>
            ({
              ...d,
              type: "payroll" as const,
              recipientCount: d.recipientCount ?? 0,
              totalAmount: d.totalAmount ?? "0",
              amount: d.totalAmount ?? "0",
              recipient: `${d.recipientCount ?? 0} recipients`,
            }))
        : [];

      const all = [...singleDrafts, ...payrollDrafts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setDrafts(all);
    } catch {
      // ignore
    } finally {
      setDraftsLoading(false);
    }
  }, [multisigAddress]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

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
          <ClientWalletButton />
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/cofre/${multisigAddress.toBase58()}/send`}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Prepare send
            </Link>
            <Link
              href={`/cofre/${multisigAddress.toBase58()}/payroll`}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Payroll
            </Link>
            <Link
              href={`/cofre/${multisigAddress.toBase58()}/audit`}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Audit
            </Link>
            <Link
              href={`/cofre/${multisigAddress.toBase58()}/invoice`}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Invoice
            </Link>
            <Link
              href={`/cofre/${multisigAddress.toBase58()}/operator`}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Operator
            </Link>
          </div>
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
            <p className="text-sm text-neutral-400">Proposal drafts</p>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-neutral-50">
              {draftsLoading ? "…" : drafts.length}
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              {drafts.length > 0 ? "Recent drafts listed below." : "Create one from Prepare send."}
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
              <h2 className="text-base font-semibold text-neutral-50">Recent proposals</h2>
            </div>
            <div className="p-4 text-sm">
              {draftsLoading ? (
                <p className="text-neutral-400">Loading…</p>
              ) : drafts.length === 0 ? (
                <p className="text-neutral-300">
                  No proposal drafts yet. Create one from the Send page.
                </p>
              ) : (
                <ul className="grid gap-3">
                  {drafts.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/cofre/${multisigAddress.toBase58()}/proposals/${d.transactionIndex}`}
                        className="flex items-center justify-between rounded-md border border-neutral-800 p-3 transition hover:border-neutral-700 hover:bg-neutral-800/50"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-neutral-100">
                            #{d.transactionIndex}
                            {d.type === "payroll" ? (
                              <span className="ml-2 rounded bg-emerald-900 px-1.5 py-0.5 text-xs text-emerald-200">
                                payroll
                              </span>
                            ) : (
                              <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                                single
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-neutral-400">
                            {d.type === "payroll"
                              ? `${d.recipientCount} recipients · ${Number(d.totalAmount ?? d.amount).toLocaleString()} lamports total`
                              : `${Number(d.amount).toLocaleString()} lamports → ${truncateAddress(d.recipient)}`}
                          </p>
                          <p className="mt-0.5 text-xs text-neutral-600">
                            {new Date(d.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="ml-3 h-4 w-4 shrink-0 text-neutral-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

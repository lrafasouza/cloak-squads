"use client";

import { AnimatedCard, StaggerContainer, StaggerItem } from "@/components/ui/animations";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { publicEnv } from "@/lib/env";
import { buildInitCofreIxBrowser } from "@/lib/gatekeeper-instructions";
import { lamportsToSol } from "@/lib/sol";
import {
  createInitCofreProposal,
  proposalApprove,
  vaultTransactionExecute,
} from "@/lib/squads-sdk";
import { cofrePda, squadsVaultPda } from "@cloak-squads/core/pda";
import { vaultTopUpLamportsNeeded } from "@cloak-squads/core/vault-funding";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as sqdsMultisig from "@sqds/multisig";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

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
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export default function CofreDashboardPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { addToast } = useToast();
  const gatekeeperProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
    [],
  );
  const squadsProgram = useMemo(() => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID), []);

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
  const [cofreStatus, setCofreStatus] = useState<"checking" | "initialized" | "missing" | "error">(
    "checking",
  );
  const [bootstrapPending, setBootstrapPending] = useState(false);
  const [bootstrapProposalIndex, setBootstrapProposalIndex] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const refreshCofreStatus = useCallback(async () => {
    if (!cofre) return;
    setCofreStatus("checking");
    try {
      const account = await connection.getAccountInfo(cofre);
      if (!account) {
        setCofreStatus("missing");
        return;
      }
      setCofreStatus(account.owner.equals(gatekeeperProgram) ? "initialized" : "error");
    } catch {
      setCofreStatus("error");
    }
  }, [cofre, connection, gatekeeperProgram]);

  const loadDrafts = useCallback(async () => {
    if (!multisigAddress) return;
    try {
      const [singleRes, payrollRes] = await Promise.all([
        fetch(`/api/proposals/${encodeURIComponent(multisigAddress.toBase58())}`),
        fetch(`/api/payrolls/${encodeURIComponent(multisigAddress.toBase58())}`),
      ]);

      const singleDrafts: DraftSummary[] = singleRes.ok
        ? ((await singleRes.json()) as DraftSummary[]).map((d) => ({
            ...d,
            type: "single" as const,
          }))
        : [];
      const payrollDrafts: DraftSummary[] = payrollRes.ok
        ? ((await payrollRes.json()) as DraftSummary[]).map((d) => ({
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

  useEffect(() => {
    void refreshCofreStatus();
  }, [refreshCofreStatus]);

  async function initializeCofre() {
    setBootstrapError(null);
    setBootstrapPending(true);

    try {
      if (!wallet.publicKey || !wallet.sendTransaction || !multisigAddress || !vault) {
        throw new Error("Connect a Squads member wallet to initialize this cofre.");
      }

      const vaultBalance = await connection.getBalance(vault, "confirmed");
      const topUpLamports = vaultTopUpLamportsNeeded(BigInt(vaultBalance));
      if (topUpLamports > 0n) {
        addToast("Funding Squads vault for cofre rent...", "info");
        const latestBlockhash = await connection.getLatestBlockhash();
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: vault,
            lamports: Number(topUpLamports),
          }),
        );
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = latestBlockhash.blockhash;
        const signature = await wallet.sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
      }

      addToast("Creating cofre bootstrap proposal...", "info");
      const initCofre = await buildInitCofreIxBrowser({
        multisig: multisigAddress,
        operator: wallet.publicKey,
      });
      const bootstrap = await createInitCofreProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        initCofreIx: initCofre.instruction,
        memo: "Initialize Cloak Squads cofre",
      });
      setBootstrapProposalIndex(bootstrap.transactionIndex.toString());

      const multisigAccount = await sqdsMultisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigAddress,
      );
      if (Number(multisigAccount.threshold) === 1) {
        addToast("Approving and executing cofre bootstrap...", "info");
        await proposalApprove({
          connection,
          wallet,
          multisigPda: multisigAddress,
          transactionIndex: bootstrap.transactionIndex,
          memo: "Approve cofre bootstrap",
        });
        const signature = await vaultTransactionExecute({
          connection,
          wallet,
          multisigPda: multisigAddress,
          transactionIndex: bootstrap.transactionIndex,
        });
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
        addToast("Cofre initialized.", "success");
      } else {
        addToast(
          `Bootstrap proposal #${bootstrap.transactionIndex.toString()} created.`,
          "success",
        );
      }

      await refreshCofreStatus();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not initialize cofre.";
      setBootstrapError(message);
      addToast(message, "error");
    } finally {
      setBootstrapPending(false);
    }
  }

  if (!multisigAddress || !cofre || !vault) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
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
          Back to picker
        </Link>
        <div className="mt-8 rounded-xl border border-red-900/50 bg-red-950/30 p-6">
          <div className="flex items-center gap-3">
            <svg
              aria-hidden="true"
              className="h-8 w-8 text-red-400"
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
            <div>
              <h1 className="text-2xl font-semibold text-neutral-50">Invalid multisig address</h1>
              <p className="mt-1 text-sm text-neutral-400">
                Check the address and open the cofre again.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900">
      <header className="border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md text-sm font-semibold text-neutral-100 hover:text-emerald-400 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
              <svg
                aria-hidden="true"
                className="h-5 w-5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            Cloak Squads
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <StaggerContainer staggerDelay={0.1}>
          <StaggerItem>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/50 bg-emerald-950/30 px-4 py-1.5 mb-3">
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  <span className="text-sm font-medium text-emerald-300">Cofre dashboard</span>
                </div>
                <h1 className="text-3xl font-bold text-neutral-50 md:text-4xl tracking-tight">
                  {truncateAddress(multisigAddress.toBase58())}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
                  Prepare private sends, review pending approvals, and monitor the shielded
                  execution state for this Squads vault.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { href: "/send", label: "Prepare send", icon: "send", variant: "default" },
                  { href: "/payroll", label: "Payroll", icon: "users", variant: "secondary" },
                  { href: "/audit", label: "Audit", icon: "shield", variant: "outline" },
                  { href: "/invoice", label: "Invoice", icon: "document", variant: "outline" },
                  { href: "/operator", label: "Operator", icon: "cog", variant: "outline" },
                ].map((action) => (
                  <Link
                    key={action.href}
                    href={`/cofre/${multisigAddress.toBase58()}${action.href}`}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                      action.variant === "default"
                        ? "bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                        : action.variant === "secondary"
                          ? "bg-emerald-700 text-neutral-100 hover:bg-emerald-600"
                          : "border-2 border-neutral-700 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          </StaggerItem>

          {cofreStatus === "missing" || cofreStatus === "error" ? (
            <StaggerItem>
              <div className="mt-6 rounded-xl border border-amber-800/50 bg-amber-950/20 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-amber-100">
                      Cofre account is not initialized
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/75">
                      This Squads multisig exists, but the gatekeeper cofre PDA has not been created
                      for the configured program. Initialize it before creating or executing private
                      send proposals.
                    </p>
                    {bootstrapProposalIndex ? (
                      <p className="mt-3 font-mono text-xs text-amber-200">
                        Bootstrap proposal #{bootstrapProposalIndex}
                      </p>
                    ) : null}
                    {bootstrapError ? (
                      <p className="mt-3 text-sm text-red-300">{bootstrapError}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    onClick={initializeCofre}
                    disabled={bootstrapPending || !wallet.publicKey}
                    className="shrink-0"
                  >
                    {bootstrapPending ? "Initializing..." : "Initialize cofre"}
                  </Button>
                </div>
              </div>
            </StaggerItem>
          ) : null}

          <StaggerItem>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <AnimatedCard className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm p-5 shadow-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-neutral-400">Shielded balance</p>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-neutral-50">
                  -- SOL
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  Cloak scan integration lands in the F1 operator flow.
                </p>
              </AnimatedCard>

              <AnimatedCard className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm p-5 shadow-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-blue-400"
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
                  </div>
                  <p className="text-sm text-neutral-400">Proposal drafts</p>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-neutral-50">
                  {draftsLoading ? "..." : drafts.length}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  {drafts.length > 0
                    ? "Recent drafts listed below."
                    : "Create one from Prepare send."}
                </p>
              </AnimatedCard>

              <AnimatedCard className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm p-5 shadow-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-purple-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-neutral-400">Connected wallet</p>
                </div>
                <p className="mt-2 break-all font-mono text-sm text-emerald-400 bg-emerald-950/20 rounded-lg px-3 py-2 border border-emerald-900/20">
                  {wallet.publicKey
                    ? truncateAddress(wallet.publicKey.toBase58())
                    : "Not connected"}
                </p>
                <p className="mt-2 text-xs text-neutral-500">Devnet execution context.</p>
              </AnimatedCard>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <AnimatedCard className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm shadow-xl overflow-hidden">
                <div className="border-b border-neutral-800/50 p-4 bg-neutral-950/30">
                  <h2 className="text-base font-semibold text-neutral-50 flex items-center gap-2">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-neutral-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    Addresses
                  </h2>
                </div>
                <dl className="space-y-4 p-4 text-sm">
                  {[
                    { label: "Multisig", value: multisigAddress.toBase58() },
                    { label: "Cofre PDA", value: cofre.toBase58() },
                    { label: "Vault PDA", value: vault.toBase58() },
                  ].map((item) => (
                    <div key={item.label} className="group">
                      <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        {item.label}
                      </dt>
                      <dd className="mt-1 break-all font-mono text-xs text-neutral-300 bg-neutral-950/50 rounded-lg px-3 py-2 border border-neutral-800/50 group-hover:border-emerald-900/30 transition-colors">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </AnimatedCard>

              <AnimatedCard className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm shadow-xl overflow-hidden">
                <div className="border-b border-neutral-800/50 p-4 bg-neutral-950/30 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-neutral-50 flex items-center gap-2">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-neutral-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    Recent proposals
                  </h2>
                  {drafts.length > 0 && (
                    <span className="text-xs text-neutral-500">{drafts.length} total</span>
                  )}
                </div>
                <div className="p-4 text-sm">
                  {draftsLoading ? (
                    <div className="flex items-center gap-3 text-neutral-400">
                      <Spinner size="sm" />
                      <span>Loading proposals...</span>
                    </div>
                  ) : drafts.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 mx-auto mb-3">
                        <svg
                          aria-hidden="true"
                          className="h-6 w-6 text-neutral-500"
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
                      </div>
                      <p className="text-neutral-400">No proposal drafts yet</p>
                      <p className="text-xs text-neutral-500 mt-1">Create one from the Send page</p>
                    </div>
                  ) : (
                    <ul className="grid gap-2">
                      {drafts.map((d) => (
                        <li key={d.id}>
                          <Link
                            href={`/cofre/${multisigAddress.toBase58()}/proposals/${d.transactionIndex}`}
                            className="flex items-center justify-between rounded-lg border border-neutral-800/50 p-4 transition-all duration-200 hover:border-emerald-900/50 hover:bg-neutral-800/50 group"
                          >
                            <div className="min-w-0">
                              <p className="font-mono text-sm text-neutral-100 flex items-center gap-2">
                                <span className="text-emerald-400">#{d.transactionIndex}</span>
                                {d.type === "payroll" && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/50 px-2.5 py-0.5 text-xs text-emerald-200 border border-emerald-800/30">
                                    <svg
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                      />
                                    </svg>
                                    payroll
                                  </span>
                                )}
                              </p>
                              <p className="mt-1.5 text-xs text-neutral-400">
                                {d.type === "payroll"
                                  ? `${d.recipientCount} recipients, ${lamportsToSol(d.totalAmount ?? d.amount)} SOL total`
                                  : `${lamportsToSol(d.amount)} SOL → ${truncateAddress(d.recipient)}`}
                              </p>
                            </div>
                            <span className="text-xs text-neutral-500 shrink-0 ml-4">
                              {new Date(d.createdAt).toLocaleDateString()}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </AnimatedCard>
            </div>
          </StaggerItem>
        </StaggerContainer>
      </section>
    </main>
  );
}

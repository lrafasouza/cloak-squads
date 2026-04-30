"use client";

import { AnimatedCard, StaggerContainer, StaggerItem } from "@/components/ui/animations";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { publicEnv } from "@/lib/env";
import { buildInitCofreIxBrowser } from "@/lib/gatekeeper-instructions";
import {
  type ProposalSummary,
  loadOnchainProposalSummaries,
  loadPersistedProposalSummaries,
  mergeProposalSummaries,
  truncateAddress,
} from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import {
  createInitCofreProposal,
  proposalApprove,
  vaultTransactionExecute,
} from "@/lib/squads-sdk";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cofrePda, squadsVaultPda } from "@cloak-squads/core/pda";
import { vaultTopUpLamportsNeeded } from "@cloak-squads/core/vault-funding";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as sqdsMultisig from "@sqds/multisig";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

export default function VaultDashboardPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { addToast } = useToast();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
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

  const [drafts, setDrafts] = useState<ProposalSummary[]>([]);
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

  const loadDrafts = useCallback(
    async (showLoading = false) => {
      if (!multisigAddress) return;
      if (showLoading) setDraftsLoading(true);
      try {
        const [persisted, onchain] = await Promise.all([
          loadPersistedProposalSummaries(multisigAddress),
          loadOnchainProposalSummaries({ connection, multisigAddress }),
        ]);
        setDrafts(mergeProposalSummaries(persisted, onchain));
      } catch {
        // ignore
      } finally {
        setDraftsLoading(false);
      }
    },
    [connection, fetchWithAuth, multisigAddress],
  );

  useEffect(() => {
    void loadDrafts(true);
  }, [loadDrafts]);

  useEffect(() => {
    const interval = setInterval(() => void loadDrafts(false), 5000);
    return () => clearInterval(interval);
  }, [loadDrafts]);

  useEffect(() => {
    void refreshCofreStatus();
  }, [refreshCofreStatus]);

  async function initializeCofre() {
    setBootstrapError(null);
    setBootstrapPending(true);
    startTransaction({
      title: "Initializing vault",
      description: "Preparing the Aegis bootstrap proposal for this Squads multisig.",
      steps: [
        {
          id: "readiness",
          title: "Check readiness",
          description: "Checking wallet, multisig, vault funding, and vault status.",
        },
        {
          id: "fund",
          title: "Fund vault rent",
          description: "Adding SOL only if the Squads vault needs rent funding.",
          status: "pending",
        },
        {
          id: "proposal",
          title: "Create bootstrap proposal",
          description: "Your wallet signs the vault initialization proposal.",
          status: "pending",
        },
        {
          id: "execute",
          title: "Execute bootstrap",
          description: "Auto-executing when this multisig has a 1-of-N threshold.",
          status: "pending",
        },
      ],
    });

    try {
      if (!wallet.publicKey || !wallet.sendTransaction || !multisigAddress || !vault) {
        throw new Error("Connect a Squads member wallet to initialize this vault.");
      }
      updateStep("readiness", { status: "success" });

      const vaultBalance = await connection.getBalance(vault, "confirmed");
      const topUpLamports = vaultTopUpLamportsNeeded(BigInt(vaultBalance));
      if (topUpLamports > 0n) {
        addToast("Funding Squads vault for rent...", "info");
        updateStep("fund", { status: "running" });
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
        updateStep("fund", {
          status: "success",
          signature,
          description: "Vault rent funding confirmed.",
        });
      } else {
        updateStep("fund", {
          status: "success",
          description: "Vault already has enough SOL for rent.",
        });
      }

      addToast("Creating vault bootstrap proposal...", "info");
      updateStep("proposal", { status: "running" });
      const initCofre = await buildInitCofreIxBrowser({
        multisig: multisigAddress,
        operator: wallet.publicKey,
      });
      const bootstrap = await createInitCofreProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        initCofreIx: initCofre.instruction,
        memo: "Initialize Aegis vault",
      });
      setBootstrapProposalIndex(bootstrap.transactionIndex.toString());
      updateStep("proposal", {
        status: "success",
        signature: bootstrap.signature,
        description: `Bootstrap proposal #${bootstrap.transactionIndex.toString()} confirmed.`,
      });

      const multisigAccount = await sqdsMultisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigAddress,
      );
      if (Number(multisigAccount.threshold) === 1) {
        addToast("Approving and executing vault bootstrap...", "info");
        updateStep("execute", { status: "running" });
        await proposalApprove({
          connection,
          wallet,
          multisigPda: multisigAddress,
          transactionIndex: bootstrap.transactionIndex,
          memo: "Approve vault bootstrap",
        });
        const signature = await vaultTransactionExecute({
          connection,
          wallet,
          multisigPda: multisigAddress,
          transactionIndex: bootstrap.transactionIndex,
        });
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
        updateStep("execute", {
          status: "success",
          signature,
          description: "Vault bootstrap executed.",
        });
        addToast("Vault initialized.", "success");
      } else {
        updateStep("execute", {
          status: "success",
          description: "Bootstrap proposal is waiting for member approvals.",
        });
        addToast(
          `Bootstrap proposal #${bootstrap.transactionIndex.toString()} created.`,
          "success",
        );
      }

      await refreshCofreStatus();
      completeTransaction({
        title: "Vault bootstrap ready",
        description:
          Number(multisigAccount.threshold) === 1
            ? "The vault is initialized."
            : "The bootstrap proposal is ready for approvals.",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not initialize vault.";
      setBootstrapError(message);
      failTransaction(message);
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
          className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent transition-colors"
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
        <div className="mt-8 rounded-xl border border-signal-danger/30 bg-signal-danger/15 p-6">
          <div className="flex items-center gap-3">
            <svg
              aria-hidden="true"
              className="h-8 w-8 text-signal-danger"
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
              <h1 className="text-2xl font-semibold text-ink">Invalid multisig address</h1>
              <p className="mt-1 text-sm text-ink-muted">
                Check the address and try again.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-bg via-bg to-surface">
      <header className="border-b border-border/50 bg-bg/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md text-sm font-semibold text-ink hover:text-accent transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft">
              <svg
                aria-hidden="true"
                className="h-5 w-5 text-accent"
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
            Aegis
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <StaggerContainer staggerDelay={0.1}>
          <StaggerItem>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-1.5 mb-3">
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 text-accent"
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
                  <span className="text-sm font-medium text-accent">Dashboard</span>
                </div>
                <h1 className="text-3xl font-bold text-ink md:text-4xl tracking-tight">
                  {truncateAddress(multisigAddress.toBase58())}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
                  Prepare private sends, review pending approvals, and monitor the shielded
                  execution state for this Squads vault.
                </p>
              </div>

            </div>
          </StaggerItem>

          {cofreStatus === "missing" || cofreStatus === "error" ? (
            <StaggerItem>
              <div className="mt-6 rounded-xl border border-signal-warn/30/50 bg-amber-950/20 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-amber-100">
                      Vault account is not initialized
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/75">
                      This Squads multisig exists, but the gatekeeper vault PDA has not been created
                      for the configured program. Initialize it before creating or executing private
                      send proposals.
                    </p>
                    {bootstrapProposalIndex ? (
                      <p className="mt-3 font-mono text-xs text-amber-200">
                        Bootstrap proposal #{bootstrapProposalIndex}
                      </p>
                    ) : null}
                    {bootstrapError ? (
                      <p className="mt-3 text-sm text-signal-danger">{bootstrapError}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    onClick={initializeCofre}
                    disabled={bootstrapPending || !wallet.publicKey}
                    className="shrink-0"
                  >
                    {bootstrapPending ? "Initializing..." : "Initialize vault"}
                  </Button>
                </div>
              </div>
            </StaggerItem>
          ) : null}

          <StaggerItem>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-accent"
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
                  <p className="text-sm text-ink-muted">Shielded balance</p>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-ink">-- SOL</p>
                <p className="mt-2 text-xs text-ink-subtle">
                  Cloak scan integration lands in the F1 operator flow.
                </p>
              </AnimatedCard>

              <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-signal-info"
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
                  <p className="text-sm text-ink-muted">Proposal drafts</p>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-ink">
                  {draftsLoading ? "..." : drafts.length}
                </p>
                <p className="mt-2 text-xs text-ink-subtle">
                  {drafts.length > 0
                    ? "Recent drafts listed below."
                    : "Create one from Prepare send."}
                </p>
              </AnimatedCard>

              <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-5 shadow-raise-1">
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
                  <p className="text-sm text-ink-muted">Connected wallet</p>
                </div>
                <p className="mt-2 break-all font-mono text-sm text-accent bg-emerald-950/20 rounded-lg px-3 py-2 border border-emerald-900/20">
                  {wallet.publicKey
                    ? truncateAddress(wallet.publicKey.toBase58())
                    : "Not connected"}
                </p>
                <p className="mt-2 text-xs text-ink-subtle">Devnet execution context.</p>
              </AnimatedCard>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm shadow-raise-1 overflow-hidden">
                <div className="border-b border-border/50 p-4 bg-bg/30">
                  <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-ink-muted"
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
                    { label: "Squads Vault PDA", value: vault.toBase58() },
                  ].map((item) => (
                    <div key={item.label} className="group">
                      <dt className="text-xs font-medium text-ink-subtle uppercase tracking-wider">
                        {item.label}
                      </dt>
                      <dd className="mt-1 break-all font-mono text-xs text-neutral-300 bg-bg/50 rounded-lg px-3 py-2 border border-border/50 group-hover:border-emerald-900/30 transition-colors">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </AnimatedCard>

              <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm shadow-raise-1 overflow-hidden">
                <div className="border-b border-border/50 p-4 bg-bg/30 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 text-ink-muted"
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
                    <span className="text-xs text-ink-subtle">{drafts.length} total</span>
                  )}
                </div>
                <div className="p-4 text-sm">
                  {draftsLoading ? (
                    <div className="flex items-center gap-3 text-ink-muted">
                      <Spinner size="sm" />
                      <span>Loading proposals...</span>
                    </div>
                  ) : drafts.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 mx-auto mb-3">
                        <svg
                          aria-hidden="true"
                          className="h-6 w-6 text-ink-subtle"
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
                      <p className="text-ink-muted">No proposal drafts yet</p>
                      <p className="text-xs text-ink-subtle mt-1">Create one from the Send page</p>
                    </div>
                  ) : (
                    <ul className="grid gap-2">
                      {drafts.map((d) => (
                        <li key={d.id}>
                          <Link
                            href={`/vault/${multisig}/proposals/${d.transactionIndex}`}
                            className="flex items-center justify-between rounded-lg border border-border/50 p-4 transition-all duration-200 hover:border-emerald-900/50 hover:bg-surface-2/50 group"
                          >
                            <div className="min-w-0">
                              <p className="font-mono text-sm text-ink flex items-center gap-2">
                                <span className="text-accent">#{d.transactionIndex}</span>
                                {d.type === "payroll" && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft/50 px-2.5 py-0.5 text-xs text-accent border border-accent/20/30">
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
                                {d.status && (
                                  <span className="inline-flex rounded-full border border-border-strong bg-surface-2 px-2.5 py-0.5 text-xs text-ink-muted">
                                    {d.status}
                                  </span>
                                )}
                              </p>
                              <p className="mt-1.5 text-xs text-ink-muted">
                                {d.type === "onchain"
                                  ? `${d.approvals ?? 0}/${d.threshold ?? "?"} approvals`
                                  : d.type === "payroll"
                                    ? `${d.recipientCount} recipients, ${lamportsToSol(d.totalAmount ?? d.amount)} SOL total`
                                    : `${lamportsToSol(d.amount)} SOL → ${truncateAddress(d.recipient)}`}
                              </p>
                            </div>
                            <span className="text-xs text-ink-subtle shrink-0 ml-4">
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

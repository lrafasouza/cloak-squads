"use client";

import { AddressPill } from "@/components/ui/address-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast-provider";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { WarningCallout } from "@/components/ui/warning-callout";
import { publicEnv } from "@/lib/env";
import { buildInitCofreIxBrowser } from "@/lib/gatekeeper-instructions";
import { type ProposalSummary, truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import {
  createInitCofreProposal,
  proposalApprove,
  vaultTransactionExecute,
} from "@/lib/squads-sdk";
import { proposalSummariesQueryKey, useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { vaultTopUpLamportsNeeded } from "@cloak-squads/core/vault-funding";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as sqdsMultisig from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ── Overview card — Total balance + quick actions ── */
function OverviewCard({
  multisig,
  balanceSol,
  cofreInitialized,
  onRefresh,
}: {
  multisig: string;
  balanceSol: string;
  cofreInitialized: boolean;
  onRefresh: () => void;
}) {
  const base = `/vault/${multisig}`;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-raise-1">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
          Total Balance
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="Refresh balance"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-1 text-3xl font-bold tabular-nums text-ink">
        {balanceSol} <span className="text-lg font-medium text-ink-muted">SOL</span>
      </p>

      {!cofreInitialized && (
        <WarningCallout variant="warning" className="mt-3">
          Privacy vault not initialized. Go to Dashboard and bootstrap the Aegis vault to enable
          private transactions.
        </WarningCallout>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Link
          href={`${base}/send`}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Send
        </Link>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(multisig)}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
        >
          <ArrowDownToLine className="h-4 w-4" />
          Deposit
        </button>
        <Link
          href={`${base}/payroll`}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink sm:col-span-1"
        >
          <Zap className="h-4 w-4" />
          Payroll
        </Link>
      </div>
    </div>
  );
}

/* ── Pending proposals list (compact) ── */
function PendingProposalsList({
  multisig,
  proposals,
}: {
  multisig: string;
  proposals: ProposalSummary[];
}) {
  const pending = proposals.filter(
    (p) => p.status === "active" || p.status === "approved" || p.status === "draft",
  );
  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Pending Proposals</h3>
        <Link
          href={`/vault/${multisig}/proposals`}
          className="text-xs text-ink-subtle transition-colors hover:text-ink"
        >
          View all →
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {pending.slice(0, 5).map((p) => {
          const kindIcon = p.type === "payroll" ? "💸" : p.type === "single" ? "↗" : "⚙";
          const summary =
            p.type === "payroll"
              ? `Payroll • ${p.recipientCount ?? "?"} recipients`
              : p.amount && p.amount !== "0"
                ? `${lamportsToSol(p.amount)} SOL → ${truncateAddress(p.recipient)}`
                : p.memo || "Config change";
          const sigProgress =
            p.approvals != null && p.threshold != null ? `${p.approvals}/${p.threshold}` : "—";
          const actionLabel =
            p.status === "draft"
              ? "Draft"
              : p.status === "approved" ||
                  (p.approvals ?? 0) >= (p.threshold ?? Number.POSITIVE_INFINITY)
                ? "Execute"
                : "Sign";
          const statusLabel =
            p.status === "approved" ? "Approved" : p.status === "draft" ? "Draft" : "Needs vote";

          return (
            <Link
              key={p.id}
              href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm transition-colors hover:border-border-strong"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="shrink-0 text-base">{kindIcon}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    #{p.transactionIndex} {summary}
                  </p>
                  {p.memo && <p className="truncate text-xs text-ink-subtle">{p.memo}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                  {sigProgress}
                </span>
                <span className="rounded-md bg-signal-warn/15 px-2 py-0.5 text-xs font-medium text-signal-warn">
                  {statusLabel}
                </span>
                <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">
                  {actionLabel}
                </span>
              </div>
            </Link>
          );
        })}
        {pending.length > 5 && (
          <Link
            href={`/vault/${multisig}/proposals`}
            className="py-1.5 text-center text-xs text-ink-subtle transition-colors hover:text-ink"
          >
            +{pending.length - 5} more proposals
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── Recent activity card ── */
function RecentActivityCard({
  multisig,
  proposals,
}: {
  multisig: string;
  proposals: ProposalSummary[];
}) {
  const recent = proposals
    .filter((p) => p.status === "executed" || p.status === "rejected" || p.status === "cancelled")
    .slice(0, 5);

  if (recent.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Recent Activity</h3>
        <Link
          href={`/vault/${multisig}/proposals`}
          className="text-xs text-ink-subtle transition-colors hover:text-ink"
        >
          View all →
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {recent.map((p) => {
          const statusLabel =
            p.status === "executed"
              ? "Executed"
              : p.status === "rejected"
                ? "Rejected"
                : "Cancelled";
          const statusColor =
            p.status === "executed" ? "text-signal-success" : "text-signal-danger";
          const summary =
            p.type === "payroll"
              ? `Payroll • ${p.recipientCount ?? "?"} recipients`
              : p.amount && p.amount !== "0"
                ? `${lamportsToSol(p.amount)} SOL → ${truncateAddress(p.recipient)}`
                : p.memo || "Config change";

          return (
            <Link
              key={p.id}
              href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0">
                <p className="truncate text-ink">
                  #{p.transactionIndex} {summary}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-medium ${statusColor}`}>{statusLabel}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Members row card ── */
function MembersCard({
  multisig,
  members,
  threshold,
}: {
  multisig: string;
  members: string[];
  threshold: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Members</h3>
        <Link
          href={`/vault/${multisig}/members`}
          className="text-xs text-ink-subtle transition-colors hover:text-ink"
        >
          View all →
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {members.slice(0, 5).map((addr) => (
          <AddressPill key={addr} value={addr} chars={4} />
        ))}
        {members.length > 5 && (
          <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-ink-subtle">
            +{members.length - 5} more
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        <span className="font-semibold text-ink">
          {threshold}/{members.length}
        </span>{" "}
        signatures required to execute
      </p>
    </div>
  );
}

/* ── Vault info footer ── */
function VaultInfoFooter({ multisig }: { multisig: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="mb-1 text-xs font-medium text-ink-subtle">Vault address</p>
          <AddressPill value={multisig} chars={8} />
        </div>
        <a
          href={`https://solscan.io/account/${multisig}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Explorer
        </a>
      </div>
    </div>
  );
}

/* ── Bootstrap card — initialize Aegis privacy layer ── */
function BootstrapCard({ multisig }: { multisig: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const squadsProgram = useMemo(() => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID), []);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBootstrap = useCallback(async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) return;
    setPending(true);
    setError(null);

    const multisigPk = new PublicKey(multisig);
    const [vault] = squadsVaultPda(multisigPk, squadsProgram);

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
        multisig: multisigPk,
        operator: wallet.publicKey,
      });
      const bootstrap = await createInitCofreProposal({
        connection,
        wallet,
        multisigPda: multisigPk,
        initCofreIx: initCofre.instruction,
        memo: "Initialize Aegis vault",
      });
      updateStep("proposal", {
        status: "success",
        signature: bootstrap.signature,
        description: `Bootstrap proposal #${bootstrap.transactionIndex.toString()} confirmed.`,
      });

      const multisigAccount = await sqdsMultisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPk,
      );
      if (Number(multisigAccount.threshold) === 1) {
        addToast("Approving and executing vault bootstrap...", "info");
        updateStep("execute", { status: "running" });
        await proposalApprove({
          connection,
          wallet,
          multisigPda: multisigPk,
          transactionIndex: bootstrap.transactionIndex,
          memo: "Approve vault bootstrap",
        });
        const execSig = await vaultTransactionExecute({
          connection,
          wallet,
          multisigPda: multisigPk,
          transactionIndex: bootstrap.transactionIndex,
        });
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction(
          { signature: execSig, ...latestBlockhash },
          "confirmed",
        );
        updateStep("execute", {
          status: "success",
          signature: execSig,
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

      await queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
      await queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      completeTransaction({
        title: "Vault bootstrap ready",
        description:
          Number(multisigAccount.threshold) === 1
            ? "The vault is initialized."
            : "The bootstrap proposal is ready for approvals.",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not initialize vault.";
      setError(message);
      failTransaction(message);
      addToast(message, "error");
    } finally {
      setPending(false);
    }
  }, [
    connection,
    wallet,
    multisig,
    squadsProgram,
    queryClient,
    addToast,
    startTransaction,
    updateStep,
    completeTransaction,
    failTransaction,
  ]);

  return (
    <div className="rounded-xl border border-accent/30 bg-accent-soft/50 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
          <Shield className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-ink">Initialize Privacy Layer</h3>
          <p className="mt-1 text-xs text-ink-muted leading-relaxed">
            Enable the Aegis gatekeeper to execute private, cloaked transactions on behalf of this
            vault. This creates a bootstrap proposal on the Squads multisig.
          </p>
          {error && (
            <WarningCallout variant="error" className="mt-3">
              {error}
            </WarningCallout>
          )}
          <button
            type="button"
            onClick={handleBootstrap}
            disabled={pending || !wallet.connected}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Initializing…" : "Bootstrap Vault"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ══════════════════════════════════════════════════════════ */

function DashboardVaultIdentity({ multisig }: { multisig: string }) {
  const [vaultName, setVaultName] = useState<string | undefined>();
  const [copiedAddress, setCopiedAddress] = useState(false);

  useEffect(() => {
    if (!multisig) {
      setVaultName(undefined);
      return;
    }

    let cancelled = false;
    setVaultName(undefined);

    fetch(`/api/vaults/${encodeURIComponent(multisig)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((metadata: { name?: string } | null) => {
        if (!cancelled) setVaultName(metadata?.name || undefined);
      })
      .catch(() => {
        if (!cancelled) setVaultName(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [multisig]);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(multisig);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 1200);
    } catch {
      setCopiedAddress(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
      <div className="group/address mt-0.5 flex items-center gap-1.5">
        <p className="font-mono text-xs text-ink-muted">
          <span className={vaultName ? "group-hover/address:hidden" : undefined}>
            {vaultName || truncateAddress(multisig)}
          </span>
          {vaultName ? (
            <span className="hidden group-hover/address:inline">{truncateAddress(multisig)}</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={handleCopyAddress}
          className="flex h-5 w-5 items-center justify-center rounded text-ink-subtle opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover/address:opacity-100"
          aria-label="Copy vault address"
          title={copiedAddress ? "Copied" : multisig}
        >
          {copiedAddress ? (
            <Check className="h-3 w-3 text-signal-success" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}

export function VaultDashboard({ multisig }: { multisig: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useVaultData(multisig);
  const { data: proposals = [] } = useProposalSummaries(multisig);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load vault"
          description="Check that the vault address is correct and you're connected to the right network."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <VaultIdenticon seed={multisig} size={40} className="rounded-xl" />
        <DashboardVaultIdentity multisig={multisig} />
      </div>

      {/* Pending proposals list */}
      <PendingProposalsList multisig={multisig} proposals={proposals} />

      {/* Overview */}
      <OverviewCard
        multisig={multisig}
        balanceSol={data.balanceSol}
        cofreInitialized={data.cofreInitialized}
        onRefresh={refresh}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={data.memberCount} icon={Users} />
        <StatCard
          label="Threshold"
          value={`${data.threshold}/${data.memberCount}`}
          icon={Shield}
          sub={`${Math.round((data.threshold / data.memberCount) * 100)}% required`}
        />
        <StatCard
          label="Privacy"
          value={data.cofreInitialized ? "Active" : "Inactive"}
          icon={Wallet}
          sub={data.cofreInitialized ? "Gatekeeper ready" : "Needs bootstrap"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Bootstrap card — shown when privacy layer not initialized */}
      {!data.cofreInitialized && <BootstrapCard multisig={multisig} />}

      {/* Members card */}
      <MembersCard multisig={multisig} members={data.members} threshold={data.threshold} />

      {/* Recent activity */}
      <RecentActivityCard multisig={multisig} proposals={proposals} />

      {/* Vault info */}
      <VaultInfoFooter multisig={multisig} />
    </div>
  );
}

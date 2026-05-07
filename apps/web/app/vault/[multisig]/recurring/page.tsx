"use client";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast-provider";
import { TokenLogo } from "@/components/ui/token-logo";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import {
  EmptyPanel,
  InlineAlert,
  Panel,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import { CADENCE_LABELS, type Cadence } from "@/lib/recurring-cadence";
import { lamportsToSol } from "@/lib/sol";
import { createVaultProposal } from "@/lib/squads-sdk";
import { SOL_MINT } from "@/lib/tokens";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
import { solAmountToLamports } from "@cloak-squads/core/amount";
import { assertCofreInitialized } from "@cloak-squads/core/cofre-status";
import { computePayloadHash } from "@cloak-squads/core/hashing";
import { cofrePda } from "@cloak-squads/core/pda";
import type { PayloadInvariants } from "@cloak-squads/core/types";
import {
  NATIVE_SOL_MINT,
  computeUtxoCommitment,
  createUtxo,
  generateUtxoKeypair,
} from "@cloak.dev/sdk-devnet";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  Eye,
  Lock,
  Pause,
  Play,
  Plus,
  Repeat,
  Send,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

type RecurringPayment = {
  id: string;
  cofreAddress: string;
  vaultIndex: number;
  label: string;
  recipient: string;
  mode: "bound" | "bearer";
  amount: string;
  mint: string;
  cadence: Cadence;
  nextDueAt: string;
  lastRunAt: string | null;
  privacy: "private" | "public";
  status: "active" | "paused" | "cancelled";
  createdBy: string;
  createdAt: string;
};

type StatusFilter = "all" | "due" | "active" | "paused";

const CADENCE_TO_MONTHS: Record<Cadence, number> = {
  weekly: 4.345,
  biweekly: 2.172,
  monthly: 1,
  quarterly: 0.333,
};

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function truncateAddress(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
}

function formatRelativeDate(iso: string): {
  text: string;
  tone: "danger" | "warning" | "neutral";
} {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffMs < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      text: overdueDays === 0 ? "Due today" : `${overdueDays}d overdue`,
      tone: "danger",
    };
  }
  if (diffDays === 0) return { text: "Due today", tone: "warning" };
  if (diffDays <= 7) return { text: `In ${diffDays}d`, tone: "warning" };
  return { text: `In ${diffDays}d`, tone: "neutral" };
}

function formatLastRun(iso: string | null): string {
  if (!iso) return "Never run";
  const d = new Date(iso);
  return `Last run ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function statusOf(item: RecurringPayment): "due" | "upcoming" | "paused" {
  if (item.status === "paused") return "paused";
  if (new Date(item.nextDueAt).getTime() <= Date.now()) return "due";
  return "upcoming";
}

export default function RecurringPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
  const { data: solPrice } = useSolPrice();

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const [items, setItems] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmEarlyRun, setConfirmEarlyRun] = useState<RecurringPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const reload = useCallback(async () => {
    if (!multisigAddress) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/recurring/${encodeURIComponent(multisigAddress.toBase58())}`,
      );
      if (res.ok) {
        const data = (await res.json()) as RecurringPayment[];
        setItems(data);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, multisigAddress]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Re-render every minute so "Due in Xd" countdowns stay accurate without a
  // refetch. Cheap because the heavy work is in the parent reload, not here.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const active = items.filter((i) => i.status === "active");
    const due = active.filter((i) => new Date(i.nextDueAt).getTime() <= Date.now());
    const dueIn7d = active.filter((i) => {
      const dt = new Date(i.nextDueAt).getTime();
      return dt > Date.now() && dt <= Date.now() + 7 * 24 * 3600 * 1000;
    });

    let monthlyLamports = 0n;
    for (const it of active) {
      const factor = CADENCE_TO_MONTHS[it.cadence] ?? 0;
      // Use floating-point math for the monthly normalization (it's a forecast,
      // not a settlement number), then cast back to lamports.
      const normalized = Math.round(Number(BigInt(it.amount)) * factor);
      monthlyLamports += BigInt(normalized);
    }
    const monthlySol = Number(monthlyLamports) / 1_000_000_000;
    const monthlyUsd = solPrice != null ? monthlySol * solPrice : null;

    return {
      activeCount: active.length,
      dueCount: due.length,
      dueIn7dCount: dueIn7d.length,
      monthlySol,
      monthlyUsd,
    };
  }, [items, solPrice]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "due")
      return items.filter((i) => i.status === "active" && statusOf(i) === "due");
    if (filter === "active") return items.filter((i) => i.status === "active");
    if (filter === "paused") return items.filter((i) => i.status === "paused");
    return items;
  }, [items, filter]);

  const groups = useMemo(() => {
    const due: RecurringPayment[] = [];
    const upcoming: RecurringPayment[] = [];
    const paused: RecurringPayment[] = [];
    for (const it of filteredItems) {
      const s = statusOf(it);
      if (s === "due") due.push(it);
      else if (s === "upcoming") upcoming.push(it);
      else paused.push(it);
    }
    due.sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime());
    upcoming.sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime());
    paused.sort((a, b) => a.label.localeCompare(b.label));
    return { due, upcoming, paused };
  }, [filteredItems]);

  // Entry point from row buttons. If the schedule is not due yet, route
  // through a confirmation modal so the user has to acknowledge the early
  // run. Due/overdue runs proceed straight to the on-chain flow.
  const handleRunRequest = (item: RecurringPayment) => {
    if (statusOf(item) === "upcoming") {
      setConfirmEarlyRun(item);
      return;
    }
    void handleRun(item);
  };

  const handleRun = async (item: RecurringPayment) => {
    if (!multisigAddress || !wallet.publicKey) return;
    if (item.mint !== SOL_MINT) {
      setError("Only SOL is supported in this scaffold sprint.");
      return;
    }

    const isPrivate = item.privacy === "private";
    setRunning(item.id);
    setError(null);

    if (isPrivate) {
      // Private path mirrors SendModal's flow: deposit into Cloak via the
      // operator. The gatekeeper hardcodes vault[0], so private recurring
      // schedules can only run from Primary; we surface the error here in
      // case a stale schedule was created before this guard existed.
      if (item.vaultIndex !== 0) {
        setError(
          "Private recurring payments must source from Primary. Recreate this schedule on Primary or switch it to Public.",
        );
        setRunning(null);
        return;
      }
      let recipientPk: PublicKey;
      try {
        recipientPk = new PublicKey(item.recipient);
      } catch {
        setError("Invalid recipient address on schedule.");
        setRunning(null);
        return;
      }
      if (!PublicKey.isOnCurve(recipientPk.toBuffer())) {
        setError(
          "Recipient is not an Ed25519 wallet. Cloak's shielded pool can only deliver to standard wallets, switch to Public mode.",
        );
        setRunning(null);
        return;
      }

      startTransaction({
        title: `Run ${item.label} privately`,
        description: `Routing ${lamportsToSol(item.amount)} SOL to ${truncateAddress(item.recipient)} via Cloak.`,
        steps: [
          {
            id: "validate",
            title: "Validate",
            description: "Checking operator, vault balance, and recipient.",
          },
          {
            id: "commitment",
            title: "Build private send",
            description: "Creating the shielded transfer details.",
            status: "pending",
          },
          {
            id: "sign",
            title: "Sign and submit",
            description: "Wallet signs the proposal.",
            status: "pending",
          },
          {
            id: "persist",
            title: "Save transfer details",
            description: "Storing the private payment data for the operator.",
            status: "pending",
          },
          {
            id: "bump",
            title: "Update schedule",
            description: "Rolling forward to next due date.",
            status: "pending",
          },
        ],
      });

      try {
        const [vaultPda] = multisigSdk.getVaultPda({
          multisigPda: multisigAddress,
          index: 0,
        });
        const tokenUnits = BigInt(item.amount);
        const vaultBalance = await connection.getBalance(vaultPda, "confirmed");
        if (BigInt(vaultBalance) < tokenUnits) {
          throw new Error(
            `Insufficient vault balance. Need ${lamportsToSol(item.amount)} SOL, vault has ${lamportsToSol(String(vaultBalance))} SOL.`,
          );
        }

        const gatekeeperProgram = new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID);
        await assertCofreInitialized({
          connection,
          multisig: multisigAddress,
          gatekeeperProgram,
        });

        const [cofreAddr] = cofrePda(multisigAddress, gatekeeperProgram);
        const cofreAccount = await connection.getAccountInfo(cofreAddr);
        if (!cofreAccount) throw new Error("Privacy vault not found.");
        const coder = new BorshAccountsCoder(IDL as Idl);
        const cofreData = coder.decode<{ operator?: Uint8Array }>("Cofre", cofreAccount.data);
        if (!cofreData?.operator)
          throw new Error("No operator registered. Set an operator wallet first.");
        const operatorPubkey = new PublicKey(cofreData.operator);

        updateStep("validate", { status: "success" });
        updateStep("commitment", { status: "running" });

        const cloakMint = NATIVE_SOL_MINT;
        const keypair = await generateUtxoKeypair();
        const utxo = await createUtxo(tokenUnits, keypair, cloakMint);
        const commitmentBigInt = await computeUtxoCommitment(utxo);
        const commitmentHex = commitmentBigInt.toString(16).padStart(64, "0");

        const invariants: PayloadInvariants = {
          nullifier: randomBytes(32),
          commitment: hexToBytes(commitmentHex),
          amount: tokenUnits,
          tokenMint: cloakMint,
          recipientVkPub: recipientPk.toBytes(),
          nonce: randomBytes(16),
        };
        const payloadHash = computePayloadHash(invariants);

        updateStep("commitment", { status: "success" });
        updateStep("sign", { status: "running" });

        const { instruction: licenseIx } = await buildIssueLicenseIxBrowser({
          multisig: multisigAddress,
          payloadHash,
          nonce: invariants.nonce,
        });

        const proposalInstructions = [
          SystemProgram.transfer({
            fromPubkey: vaultPda,
            toPubkey: operatorPubkey,
            lamports: tokenUnits,
          }),
          licenseIx,
        ];

        const result = await createVaultProposal({
          connection,
          wallet,
          multisigPda: multisigAddress,
          instructions: proposalInstructions,
          memo: `recurring private: ${item.label}`,
          vaultIndex: 0,
        });

        const transactionIndex = result.transactionIndex.toString();
        updateStep("sign", {
          status: "success",
          signature: result.signature,
          description: `Proposal #${transactionIndex} confirmed.`,
        });
        updateStep("persist", { status: "running" });

        const commitmentClaim = {
          amount: tokenUnits.toString(),
          keypairPrivateKey: keypair.privateKey.toString(16).padStart(64, "0"),
          keypairPublicKey: keypair.publicKey.toString(16).padStart(64, "0"),
          blinding: utxo.blinding.toString(16).padStart(64, "0"),
          commitment: commitmentHex,
          recipient_vk: recipientPk.toBase58(),
          token_mint: cloakMint.toBase58(),
        };

        const draftRes = await fetchWithAuth("/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cofreAddress: multisigAddress.toBase58(),
            transactionIndex,
            amount: tokenUnits.toString(),
            recipient: recipientPk.toBase58(),
            payloadHash: Array.from(payloadHash),
            invariants: {
              nullifier: Array.from(invariants.nullifier),
              commitment: Array.from(invariants.commitment),
              amount: tokenUnits.toString(),
              tokenMint: cloakMint.toBase58(),
              recipientVkPub: Array.from(invariants.recipientVkPub),
              nonce: Array.from(invariants.nonce),
            },
            commitmentClaim,
            vaultIndex: 0,
          }),
        });
        if (!draftRes.ok) {
          const body = (await draftRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Could not persist proposal draft.");
        }

        updateStep("persist", { status: "success" });
        updateStep("bump", { status: "running" });
        const bumpRes = await fetchWithAuth(
          `/api/recurring/${encodeURIComponent(multisigAddress.toBase58())}/${encodeURIComponent(item.id)}/run`,
          { method: "POST" },
        );
        if (!bumpRes.ok) {
          const body = (await bumpRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(
            body?.error ??
              "Proposal landed on-chain but the schedule did not roll forward. Reload the page.",
          );
        }
        const bumpData = (await bumpRes.json()) as {
          lastRunAt: string | null;
          nextDueAt: string;
        };
        // Patch local state right away so the row reflects the new schedule
        // before the background reload returns.
        setItems((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? { ...p, lastRunAt: bumpData.lastRunAt, nextDueAt: bumpData.nextDueAt }
              : p,
          ),
        );
        updateStep("bump", { status: "success" });
        completeTransaction({
          title: "Private recurring payment ran",
          description: `Proposal #${transactionIndex} is in the queue. The operator will execute the shielded deposit.`,
        });

        void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
        void reload();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Run failed.";
        setError(message);
        failTransaction(message);
      } finally {
        setRunning(null);
      }
      return;
    }

    // Public path
    startTransaction({
      title: `Run ${item.label}`,
      description: `Sending ${lamportsToSol(item.amount)} SOL to ${truncateAddress(item.recipient)}.`,
      steps: [
        {
          id: "build",
          title: "Build proposal",
          description: "Composing the transfer instruction.",
        },
        {
          id: "sign",
          title: "Sign and submit",
          description: "Wallet signs the proposal.",
          status: "pending",
        },
        {
          id: "bump",
          title: "Update schedule",
          description: "Rolling forward to next due date.",
          status: "pending",
        },
      ],
    });

    try {
      const [vaultPda] = multisigSdk.getVaultPda({
        multisigPda: multisigAddress,
        index: item.vaultIndex,
      });

      const recipientPk = new PublicKey(item.recipient);
      const ix = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: recipientPk,
        lamports: BigInt(item.amount),
      });
      updateStep("build", { status: "success" });
      updateStep("sign", { status: "running" });

      const result = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: [ix],
        memo: `recurring: ${item.label}`,
        vaultIndex: item.vaultIndex,
      });
      updateStep("sign", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${result.transactionIndex} confirmed.`,
      });

      updateStep("bump", { status: "running" });
      const bumpRes = await fetchWithAuth(
        `/api/recurring/${encodeURIComponent(multisigAddress.toBase58())}/${encodeURIComponent(item.id)}/run`,
        { method: "POST" },
      );
      if (!bumpRes.ok) {
        const body = (await bumpRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          body?.error ??
            "Proposal landed on-chain but the schedule did not roll forward. Reload the page.",
        );
      }
      const bumpData = (await bumpRes.json()) as {
        lastRunAt: string | null;
        nextDueAt: string;
      };
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? { ...p, lastRunAt: bumpData.lastRunAt, nextDueAt: bumpData.nextDueAt }
            : p,
        ),
      );
      updateStep("bump", { status: "success" });
      completeTransaction({
        title: "Recurring payment ran",
        description: `Proposal #${result.transactionIndex} is in the queue. Schedule bumped.`,
      });

      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      void reload();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Run failed.";
      setError(message);
      failTransaction(message);
    } finally {
      setRunning(null);
    }
  };

  const handlePauseToggle = async (item: RecurringPayment) => {
    if (!multisigAddress) return;
    const next = item.status === "active" ? "paused" : "active";
    // Optimistic update so the toggle feels instant; reload reconciles.
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: next } : p)));
    await fetchWithAuth(
      `/api/recurring/${encodeURIComponent(multisigAddress.toBase58())}/${encodeURIComponent(item.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      },
    );
    void reload();
  };

  const handleDelete = async (id: string) => {
    if (!multisigAddress) return;
    setConfirmDelete(null);
    setItems((prev) => prev.filter((p) => p.id !== id));
    await fetchWithAuth(
      `/api/recurring/${encodeURIComponent(multisigAddress.toBase58())}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    addToast("Recurring payment deleted.", "success", 3000);
    void reload();
  };

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-accent transition-colors hover:text-accent-hover">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

  const monthlyDisplay =
    stats.monthlyUsd != null
      ? `$${stats.monthlyUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : `${stats.monthlySol.toFixed(2)} SOL`;
  const monthlySub =
    stats.monthlyUsd != null ? `${stats.monthlySol.toFixed(2)} SOL committed` : "USD price loading";

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="RECURRING"
        title="Recurring payments"
        description="Track scheduled payouts and run them on demand. Aegis tracks the schedule, you click Run."
        action={
          <Button onClick={() => setShowAdd(true)} disabled={!wallet.publicKey}>
            <Plus className="mr-1.5 h-4 w-4" /> New schedule
          </Button>
        }
      />

      {/* KPI strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Active schedules"
          value={loading ? "..." : stats.activeCount.toString()}
          icon={Repeat}
          sub={
            stats.activeCount === 0
              ? "Nothing scheduled yet"
              : `${stats.activeCount} live, ${items.filter((i) => i.status === "paused").length} paused`
          }
        />
        <StatCard
          label="Monthly outflow"
          value={loading ? "..." : monthlyDisplay}
          icon={TrendingUp}
          sub={loading ? "" : monthlySub}
        />
        <StatCard
          label="Due this week"
          value={loading ? "..." : (stats.dueCount + stats.dueIn7dCount).toString()}
          icon={CalendarClock}
          sub={
            stats.dueCount > 0
              ? `${stats.dueCount} overdue, ${stats.dueIn7dCount} upcoming`
              : `${stats.dueIn7dCount} upcoming`
          }
        />
      </div>

      {error && (
        <InlineAlert tone="danger" className="mb-4">
          {error}
        </InlineAlert>
      )}

      {/* Filters */}
      {!loading && items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border pb-2">
          {(
            [
              ["all", "All", items.length],
              ["due", "Due now", groups.due.length],
              ["active", "Active", items.filter((i) => i.status === "active").length],
              ["paused", "Paused", items.filter((i) => i.status === "paused").length],
            ] as Array<[StatusFilter, string, number]>
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === key
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {label}
              {count > 0 && <span className="text-xs text-ink-subtle tabular-nums">{count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <Panel>
          <div className="divide-y divide-border/40">
            {[0, 1, 2].map((n) => (
              <div key={n} className="flex items-center gap-3 px-5 py-4">
                <div className="h-10 w-10 shimmer-bg rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 shimmer-bg rounded" />
                  <div className="h-2.5 w-64 shimmer-bg rounded" />
                </div>
                <div className="h-7 w-20 shimmer-bg rounded" />
              </div>
            ))}
          </div>
        </Panel>
      ) : items.length === 0 ? (
        <EmptyPanel
          title="No recurring payments yet"
          description="Set up a schedule for payroll, retainers, or vendor invoices. Aegis tracks the cadence and queues a proposal whenever you click Run."
          action={
            <Button onClick={() => setShowAdd(true)} disabled={!wallet.publicKey}>
              <Plus className="mr-1.5 h-4 w-4" /> Create your first schedule
            </Button>
          }
        />
      ) : filteredItems.length === 0 ? (
        <EmptyPanel
          title="Nothing matches this filter"
          description="Switch back to All to see every scheduled payment."
        />
      ) : (
        <div className="space-y-6">
          {groups.due.length > 0 && (
            <SectionList
              title="Due now"
              icon={AlertCircle}
              tone="danger"
              items={groups.due}
              runningId={running}
              onRun={handleRunRequest}
              onPause={handlePauseToggle}
              onDelete={(id) => setConfirmDelete(id)}
              connectedWallet={!!wallet.publicKey}
            />
          )}
          {groups.upcoming.length > 0 && (
            <SectionList
              title="Upcoming"
              icon={Calendar}
              tone="neutral"
              items={groups.upcoming}
              runningId={running}
              onRun={handleRunRequest}
              onPause={handlePauseToggle}
              onDelete={(id) => setConfirmDelete(id)}
              connectedWallet={!!wallet.publicKey}
            />
          )}
          {groups.paused.length > 0 && (
            <SectionList
              title="Paused"
              icon={Pause}
              tone="muted"
              items={groups.paused}
              runningId={running}
              onRun={handleRunRequest}
              onPause={handlePauseToggle}
              onDelete={(id) => setConfirmDelete(id)}
              connectedWallet={!!wallet.publicKey}
            />
          )}
        </div>
      )}

      {showAdd && (
        <AddRecurringModal
          vault={multisigAddress.toBase58()}
          fetchWithAuth={fetchWithAuth}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            void reload();
            addToast("Recurring schedule created.", "success", 3000);
          }}
        />
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete recurring payment"
        description="This stops the schedule. Past on-chain payments are unaffected."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        open={!!confirmEarlyRun}
        title="Run before due date?"
        description={
          confirmEarlyRun
            ? `${confirmEarlyRun.label} is not due until ${new Date(
                confirmEarlyRun.nextDueAt,
              ).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}. Running now creates a proposal today and rolls the schedule forward by one ${confirmEarlyRun.cadence} period.`
            : ""
        }
        confirmText="Run early"
        cancelText="Cancel"
        onConfirm={() => {
          const item = confirmEarlyRun;
          setConfirmEarlyRun(null);
          if (item) void handleRun(item);
        }}
        onCancel={() => setConfirmEarlyRun(null)}
      />
    </WorkspacePage>
  );
}

function SectionList({
  title,
  icon: Icon,
  tone,
  items,
  runningId,
  onRun,
  onPause,
  onDelete,
  connectedWallet,
}: {
  title: string;
  icon: typeof AlertCircle;
  tone: "danger" | "neutral" | "muted";
  items: RecurringPayment[];
  runningId: string | null;
  onRun: (item: RecurringPayment) => void;
  onPause: (item: RecurringPayment) => void;
  onDelete: (id: string) => void;
  connectedWallet: boolean;
}) {
  const headerColor =
    tone === "danger"
      ? "text-signal-danger"
      : tone === "muted"
        ? "text-ink-subtle"
        : "text-ink-muted";
  const anyRunning = runningId !== null;

  return (
    <div>
      <div className={cn("mb-2 flex items-center gap-1.5 text-eyebrow", headerColor)}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {title}
        <span className="text-ink-subtle/60">({items.length})</span>
      </div>
      <Panel className="divide-y divide-border/40">
        {items.map((item) => (
          <RecurringRow
            key={item.id}
            item={item}
            isRunning={runningId === item.id}
            anyRunning={anyRunning}
            onRun={() => onRun(item)}
            onPause={() => onPause(item)}
            onDelete={() => onDelete(item.id)}
            connectedWallet={connectedWallet}
          />
        ))}
      </Panel>
    </div>
  );
}

function RecurringRow({
  item,
  isRunning,
  anyRunning,
  onRun,
  onPause,
  onDelete,
  connectedWallet,
}: {
  item: RecurringPayment;
  isRunning: boolean;
  anyRunning: boolean;
  onRun: () => void;
  onPause: () => void;
  onDelete: () => void;
  connectedWallet: boolean;
}) {
  const isPaused = item.status === "paused";
  const due = formatRelativeDate(item.nextDueAt);

  return (
    <div className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-2/30 sm:flex-row sm:items-center">
      {/* Identity */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="shrink-0 rounded-lg ring-1 ring-border/60">
          <VaultIdenticon seed={item.recipient} size={36} className="rounded-lg" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{item.label}</p>
            {item.privacy === "private" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                Private
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle">
                <Eye className="h-2.5 w-2.5" aria-hidden="true" />
                Public
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-subtle">
            <span className="inline-flex items-center gap-1 font-mono">
              <Wallet className="h-3 w-3" aria-hidden="true" />
              {truncateAddress(item.recipient)}
            </span>
            <span className="text-ink-subtle/40">·</span>
            <span>{CADENCE_LABELS[item.cadence]}</span>
            {item.lastRunAt && (
              <>
                <span className="text-ink-subtle/40">·</span>
                <span>{formatLastRun(item.lastRunAt)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Amount */}
      <div className="shrink-0 sm:text-right">
        <p className="font-mono text-base font-semibold tabular-nums text-ink">
          {lamportsToSol(item.amount)}{" "}
          <span className="text-xs font-medium text-ink-subtle">SOL</span>
        </p>
        {!isPaused && (
          <p
            className={cn(
              "mt-0.5 text-xs font-medium tabular-nums",
              due.tone === "danger"
                ? "text-signal-danger"
                : due.tone === "warning"
                  ? "text-signal-warn"
                  : "text-ink-subtle",
            )}
          >
            {due.text}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {!isPaused && (
          <Button
            size="sm"
            onClick={onRun}
            disabled={anyRunning || !connectedWallet}
            variant={due.tone === "danger" || due.tone === "warning" ? "default" : "ghost"}
            title={
              anyRunning && !isRunning
                ? "Another schedule is running. Wait for it to finish."
                : due.tone === "neutral"
                  ? "Not due yet. Click to run early."
                  : undefined
            }
          >
            {isRunning ? (
              <>
                <span className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
                Running
              </>
            ) : (
              <>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {due.tone === "neutral" ? "Run early" : "Run now"}
              </>
            )}
          </Button>
        )}
        <button
          type="button"
          onClick={onPause}
          disabled={isRunning}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={isPaused ? "Resume schedule" : "Pause schedule"}
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isRunning}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-signal-danger disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Delete schedule"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddRecurringModal({
  vault,
  fetchWithAuth,
  onClose,
  onCreated,
}: {
  vault: string;
  fetchWithAuth: ReturnType<typeof useWalletAuth>["fetchWithAuth"];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [privacy, setPrivacy] = useState<"private" | "public">("private");
  const [nextDate, setNextDate] = useState(() =>
    new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipientPk = useMemo(() => {
    try {
      return new PublicKey(recipient.trim());
    } catch {
      return null;
    }
  }, [recipient]);
  const recipientValid = !!recipientPk;
  const recipientOnCurve = recipientPk ? PublicKey.isOnCurve(recipientPk.toBuffer()) : false;
  const amountValid = /^[0-9.]+$/.test(amount) && Number(amount) > 0;
  const privacyConflict = privacy === "private" && recipientValid && !recipientOnCurve;
  const valid = label.trim().length > 0 && recipientValid && amountValid && !privacyConflict;

  const handleCreate = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const lamports = solAmountToLamports(amount);
      const res = await fetchWithAuth(`/api/recurring/${encodeURIComponent(vault)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          recipient: recipient.trim(),
          mode: "bound",
          amount: lamports.toString(),
          mint: SOL_MINT,
          cadence,
          nextDueAt: new Date(nextDate).toISOString(),
          privacy,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to create recurring payment.");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create recurring payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-border-strong bg-surface shadow-raise-2">
        <div className="border-b border-border px-6 py-5">
          <p className="text-eyebrow text-accent">NEW SCHEDULE</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Recurring payment</h3>
          <p className="mt-1 text-xs text-ink-subtle">
            Aegis tracks the cadence. You click Run when each cycle is due.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <Label>Privacy</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPrivacy("private")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  privacy === "private"
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-border bg-surface text-ink-muted hover:bg-surface-2",
                )}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock className="h-3.5 w-3.5" />
                  Private
                </span>
                <span className="text-[11px] leading-snug text-ink-subtle">
                  Routes through Cloak. Recipient and amount hidden on-chain.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPrivacy("public")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  privacy === "public"
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-border bg-surface text-ink-muted hover:bg-surface-2",
                )}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Eye className="h-3.5 w-3.5" />
                  Public
                </span>
                <span className="text-[11px] leading-snug text-ink-subtle">
                  Direct vault transfer. Visible on block explorers.
                </span>
              </button>
            </div>
            {privacy === "private" && (
              <p className="mt-1.5 text-[11px] text-ink-subtle">
                Private runs source from Primary and need the operator wallet to execute the Cloak
                deposit after each Run.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="rec-label">Label</Label>
            <Input
              id="rec-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Q2 advisor, Alice"
              className="mt-1.5"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="rec-recipient">Recipient wallet</Label>
            <Input
              id="rec-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Solana address"
              spellCheck={false}
              className={cn(
                "mt-1.5 font-mono",
                recipient.length > 0 && !recipientValid && "border-signal-danger/40",
                privacyConflict && "border-signal-warn/40",
              )}
            />
            {recipient.length > 0 && !recipientValid && (
              <p className="mt-1 text-xs text-signal-danger">Not a valid Solana address.</p>
            )}
            {privacyConflict && (
              <p className="mt-1 text-xs text-signal-warn">
                This address is off-curve (likely a vault PDA). Cloak only delivers to standard
                Ed25519 wallets. Switch to Public or use a different recipient.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="rec-amount">Amount</Label>
            <div className="mt-1.5 flex gap-2">
              <div className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 text-sm font-medium text-ink">
                <TokenLogo symbol="SOL" size={16} />
                SOL
              </div>
              <Input
                id="rec-amount"
                type="number"
                step="0.000000001"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rec-cadence">Cadence</Label>
              <select
                id="rec-cadence"
                value={cadence}
                onChange={(e) => setCadence(e.target.value as Cadence)}
                className="mt-1.5 block min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
                <option value="quarterly">Every quarter</option>
              </select>
            </div>
            <div>
              <Label htmlFor="rec-next">First due date</Label>
              <Input
                id="rec-next"
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="mt-1.5"
              />
            </div>
          </div>

          <p className="text-xs text-ink-subtle">
            The schedule rolls forward by one cadence after each run.
          </p>
        </div>

        {error && (
          <div className="border-t border-border px-6 py-3">
            <InlineAlert tone="danger">{error}</InlineAlert>
          </div>
        )}

        <div className="flex gap-3 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!valid || submitting} className="flex-1">
            {submitting ? "Creating..." : "Create schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}

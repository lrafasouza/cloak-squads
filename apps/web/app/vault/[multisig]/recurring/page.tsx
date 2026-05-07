"use client";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import {
  EmptyPanel,
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { CADENCE_LABELS, type Cadence } from "@/lib/recurring-cadence";
import { lamportsToSol } from "@/lib/sol";
import { createVaultProposal } from "@/lib/squads-sdk";
import { SOL_MINT, tokenAmountToUnits } from "@/lib/tokens";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { solAmountToLamports } from "@cloak-squads/core/amount";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Pause, Play, Plus, Repeat, Send, Trash2 } from "lucide-react";
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

function isPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function truncate(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
}

function isOverdue(nextDueAt: string) {
  return new Date(nextDueAt).getTime() < Date.now();
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
  const [error, setError] = useState<string | null>(null);

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

  const handleRun = async (item: RecurringPayment) => {
    if (!multisigAddress || !wallet.publicKey) return;
    setRunning(item.id);
    setError(null);
    startTransaction({
      title: `Run ${item.label}`,
      description: `Creating a proposal to send ${lamportsToSol(item.amount)} SOL to ${truncate(item.recipient)}.`,
      steps: [
        {
          id: "build",
          title: "Build proposal",
          description: "Composing the transfer instruction.",
        },
        {
          id: "sign",
          title: "Sign + submit",
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

      // Sprint scope: we ship public sends only. Private routing for recurring
      // payments waits on the sub-vault gatekeeper parametrization (Tier 2 #4).
      if (item.mint !== SOL_MINT) {
        throw new Error("Only SOL is supported in this scaffold sprint.");
      }
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
      await fetchWithAuth(
        `/api/recurring/${encodeURIComponent(multisigAddress.toBase58())}/${encodeURIComponent(item.id)}/run`,
        { method: "POST" },
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

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="RECURRING"
        title="Recurring payments"
        description="Track scheduled payouts and run them on demand. Aegis tracks the schedule — you click Run."
        action={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add recurring
          </Button>
        }
      />

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {loading ? (
        <Panel>
          <PanelBody>
            <p className="text-sm text-ink-muted">Loading...</p>
          </PanelBody>
        </Panel>
      ) : items.length === 0 ? (
        <EmptyPanel
          title="No recurring payments yet"
          description="Add a recurring payment to track payroll, vendor invoices, or ongoing payouts."
        />
      ) : (
        <Panel>
          <PanelHeader
            icon={Repeat}
            title="Schedule"
            description={`${items.length} recurring payments`}
          />
          <PanelBody>
            <ul className="divide-y divide-border/60">
              {items.map((item) => {
                const overdue = isOverdue(item.nextDueAt) && item.status === "active";
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">{item.label}</p>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            item.status === "active"
                              ? "bg-accent-soft text-accent"
                              : item.status === "paused"
                                ? "bg-surface-2 text-ink-subtle"
                                : "bg-signal-danger/10 text-signal-danger"
                          }`}
                        >
                          {item.status}
                        </span>
                        {overdue && (
                          <span className="rounded-md bg-signal-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal-warn">
                            Due
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-subtle">
                        <span className="font-mono text-ink">{lamportsToSol(item.amount)} SOL</span>{" "}
                        → <span className="font-mono">{truncate(item.recipient)}</span> ·{" "}
                        {CADENCE_LABELS[item.cadence]}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-subtle">
                        <Calendar className="h-3 w-3" />
                        Next: {new Date(item.nextDueAt).toLocaleDateString()}
                        {item.lastRunAt &&
                          ` · Last run: ${new Date(item.lastRunAt).toLocaleDateString()}`}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {item.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRun(item)}
                          disabled={running === item.id || !wallet.publicKey}
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          {running === item.id ? "Running..." : "Run now"}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handlePauseToggle(item)}>
                        {item.status === "active" ? (
                          <>
                            <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="mr-1.5 h-3.5 w-3.5" /> Resume
                          </>
                        )}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmDelete(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </PanelBody>
        </Panel>
      )}

      {showAdd && (
        <AddRecurringModal
          vault={multisigAddress.toBase58()}
          fetchWithAuth={fetchWithAuth}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            void reload();
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
    </WorkspacePage>
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
  const [nextDate, setNextDate] = useState(() =>
    new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    label.trim().length > 0 &&
    isPubkey(recipient) &&
    /^[0-9.]+$/.test(amount) &&
    Number(amount) > 0;

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
          privacy: "public",
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

  // Keep tokenAmountToUnits import alive — used in the future SPL extension
  void tokenAmountToUnits;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-border-strong bg-surface p-6 shadow-raise-2">
        <h3 className="text-lg font-semibold text-ink">Add recurring payment</h3>
        <p className="mt-1 text-xs text-ink-subtle">
          Aegis tracks the schedule. Each cadence period you click <strong>Run now</strong> to
          create the proposal — automatic execution lands when the sub-vault gatekeeper update
          ships.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="rec-label">Label</Label>
            <Input
              id="rec-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Q2 advisor — Alice"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="rec-recipient">Recipient wallet</Label>
            <Input
              id="rec-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Solana address"
              className="mt-1.5 font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rec-amount">Amount (SOL)</Label>
              <Input
                id="rec-amount"
                type="number"
                step="0.000000001"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="rec-cadence">Cadence</Label>
              <select
                id="rec-cadence"
                value={cadence}
                onChange={(e) => setCadence(e.target.value as Cadence)}
                className="mt-1.5 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink"
              >
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
                <option value="quarterly">Every quarter</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="rec-next">First due date</Label>
            <Input
              id="rec-next"
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        {error && (
          <InlineAlert tone="danger" className="mt-3">
            {error}
          </InlineAlert>
        )}

        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!valid || submitting} className="flex-1">
            {submitting ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}

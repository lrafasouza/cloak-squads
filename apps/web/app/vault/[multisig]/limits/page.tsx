"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { WorkspaceHeader, WorkspacePage } from "@/components/ui/workspace";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { Period, createAddSpendingLimitProposal, createRemoveSpendingLimitProposal } from "@/lib/spending-limits";
import { SOL_MINT } from "@/lib/tokens";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Plus, Trash2, Zap } from "lucide-react";
import { use, useCallback, useEffect, useState } from "react";

type SpendingLimitRow = {
  id: string;
  spendingLimit: string;
  createKey: string;
  vaultIndex: number;
  mint: string;
  amountRaw: string;
  period: string;
  members: string[];
  destinations: string[];
  status: string;
};

const PERIODS = ["Day", "Week", "Month", "OneTime"] as const;

function periodLabel(p: string) {
  switch (p) {
    case "Day": return "per day";
    case "Week": return "per week";
    case "Month": return "per month";
    case "OneTime": return "one-time";
    default: return p;
  }
}

function lamportsToSol(raw: string) {
  try {
    return (Number(BigInt(raw)) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 4 });
  } catch { return raw; }
}

export default function LimitsPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { addToast } = useToast();

  const [limits, setLimits] = useState<SpendingLimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form fields
  const [formAmount, setFormAmount] = useState("");
  const [formPeriod, setFormPeriod] = useState<typeof PERIODS[number]>("Day");
  const [formMint] = useState(SOL_MINT);
  const [formVaultIndex, setFormVaultIndex] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vaults/${multisig}/spending-limits`);
      if (res.ok) setLimits(await res.json());
    } finally {
      setLoading(false);
    }
  }, [multisig]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      addToast("Connect a wallet first.", "error");
      return;
    }
    const amountSol = parseFloat(formAmount);
    if (isNaN(amountSol) || amountSol <= 0) {
      addToast("Enter a valid amount.", "error");
      return;
    }
    const amountLamports = BigInt(Math.round(amountSol * 1e9));
    const multisigPk = new PublicKey(multisig);
    const createKey = Keypair.generate().publicKey;
    const periodEnum = Period[formPeriod as keyof typeof Period];
    // Squads v4 native-SOL spending limit convention: store Pubkey::default()
    // (32-zero-byte system program ID) so spendingLimitUse({ mint: undefined })
    // matches at execution time. Wrapped-SOL mint would force the SPL ATA path.
    const isNativeSol = formMint === SOL_MINT;
    const mintPk = isNativeSol ? PublicKey.default : new PublicKey(formMint);

    setCreating(true);
    try {
      const result = await createAddSpendingLimitProposal({
        connection,
        wallet: { ...wallet, publicKey: wallet.publicKey, sendTransaction: wallet.sendTransaction },
        multisigPda: multisigPk,
        createKey,
        vaultIndex: Number(formVaultIndex),
        mint: mintPk,
        amount: amountLamports,
        period: periodEnum,
        members: [wallet.publicKey],
        destinations: [],
      });

      // Persist metadata to DB
      await fetchWithAuth(`/api/vaults/${multisig}/spending-limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spendingLimit: result.spendingLimitPda.toBase58(),
          createKey: createKey.toBase58(),
          vaultIndex: Number(formVaultIndex),
          mint: mintPk.toBase58(),
          amountRaw: amountLamports.toString(),
          period: formPeriod,
          members: [wallet.publicKey.toBase58()],
          destinations: [],
        }),
      });

      addToast(`Spending limit proposal created (#${result.transactionIndex.toString()}). Members must approve.`, "success");
      setShowForm(false);
      setFormAmount("");
      await load();
    } catch (err) {
      addToast(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (limit: SpendingLimitRow) => {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      addToast("Connect a wallet first.", "error");
      return;
    }
    if (!confirm(`Propose removal of this spending limit? Members must approve.`)) return;
    try {
      await createRemoveSpendingLimitProposal({
        connection,
        wallet: { ...wallet, publicKey: wallet.publicKey, sendTransaction: wallet.sendTransaction },
        multisigPda: new PublicKey(multisig),
        spendingLimitPda: new PublicKey(limit.spendingLimit),
      });
      // Mark as removed in DB
      await fetchWithAuth(`/api/vaults/${multisig}/spending-limits/${limit.id}`, {
        method: "DELETE",
      });
      addToast("Remove proposal submitted.", "success");
      await load();
    } catch (err) {
      addToast(String(err instanceof Error ? err.message : err), "error");
    }
  };

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Spending limits"
        title="Single-signer spending limits"
        description="Allow authorized members to send up to a set amount without a proposal. v1: public sends only."
      />

      <div className="space-y-3 max-w-2xl">
        {/* Info callout */}
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-xs text-ink-muted">
          <span className="font-semibold text-ink">Privacy bridge in v2.</span> Spending limits
          currently enable direct vault→recipient sends (public, on-chain visible). Private Cloak
          routing requires gatekeeper adaptation — tracked as follow-up.
        </div>

        {loading ? (
          <p className="text-xs text-ink-subtle px-1">Loading…</p>
        ) : limits.length === 0 ? (
          <p className="text-xs text-ink-subtle px-1">No active spending limits.</p>
        ) : (
          limits.map((lim) => (
            <div
              key={lim.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-accent" />
                  <p className="text-sm font-semibold text-ink">
                    {lamportsToSol(lim.amountRaw)} SOL {periodLabel(lim.period)}
                  </p>
                </div>
                <p className="text-[10px] text-ink-subtle font-mono">{lim.spendingLimit}</p>
                <p className="text-[10px] text-ink-subtle">
                  {lim.members.length} member{lim.members.length !== 1 ? "s" : ""} ·{" "}
                  {lim.destinations.length === 0 ? "any destination" : `${lim.destinations.length} destinations`}
                  {" · vault "}index {lim.vaultIndex}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(lim)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-2 hover:text-signal-error"
                aria-label="Remove spending limit"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}

        {/* Create form */}
        {showForm ? (
          <div className="rounded-xl border border-border bg-surface px-5 py-4 space-y-3">
            <p className="text-sm font-semibold text-ink">New spending limit</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sl-amount">Amount (SOL)</Label>
                <Input
                  id="sl-amount"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="5.0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sl-period">Period</Label>
                <select
                  id="sl-period"
                  value={formPeriod}
                  onChange={(e) => setFormPeriod(e.target.value as typeof PERIODS[number])}
                  className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent/20"
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>{p === "OneTime" ? "One-time" : p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-vault">Vault index</Label>
              <Input
                id="sl-vault"
                type="number"
                min="0"
                value={formVaultIndex}
                onChange={(e) => setFormVaultIndex(e.target.value)}
                className="w-32"
              />
            </div>
            <p className="text-[10px] text-ink-subtle">
              Authorized members: you ({wallet.publicKey?.toBase58().slice(0, 8)}…)
              · Destinations: any
            </p>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating} size="sm">
                {creating ? "Creating proposal…" : "Create proposal"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-5 py-4 text-left text-xs font-medium text-ink-subtle transition-colors hover:border-border-strong hover:text-ink"
          >
            <Plus className="h-4 w-4" />
            Add spending limit
          </button>
        )}
      </div>
    </WorkspacePage>
  );
}

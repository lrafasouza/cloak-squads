"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import {
  EmptyPanel,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { cn } from "@/lib/utils";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import {
  Period,
  createAddSpendingLimitProposal,
  createRemoveSpendingLimitProposal,
} from "@/lib/spending-limits";
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
  /** Set by GET /spending-limits after on-chain reconcile. */
  onChainExists?: boolean;
};

const PERIODS = ["Day", "Week", "Month", "OneTime"] as const;

const PERIOD_LABELS: Record<(typeof PERIODS)[number], string> = {
  Day: "Per day",
  Week: "Per week",
  Month: "Per month",
  OneTime: "One-time",
};

function periodLabel(p: string) {
  switch (p) {
    case "Day":
      return "per day";
    case "Week":
      return "per week";
    case "Month":
      return "per month";
    case "OneTime":
      return "one-time";
    default:
      return p;
  }
}

function lamportsToSol(raw: string) {
  try {
    return (Number(BigInt(raw)) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 4 });
  } catch {
    return raw;
  }
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
  const [creating, setCreating] = useState(false);

  const [formAmount, setFormAmount] = useState("");
  const [formPeriod, setFormPeriod] = useState<(typeof PERIODS)[number]>("Day");
  const [formMint] = useState(SOL_MINT);
  const [formVaultIndex, setFormVaultIndex] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [subVaultAccounts, setSubVaultAccounts] = useState<Array<{ vaultIndex: number; name: string }>>([]);

  useEffect(() => {
    fetch(`/api/vaults/${multisig}/sub-vaults`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ vaultIndex: number; name: string }>) => setSubVaultAccounts(data))
      .catch(() => {});
  }, [multisig]);

  const allAccounts = [{ vaultIndex: 0, name: "Primary" }, ...subVaultAccounts];

  const accountNameByIndex = (idx: number) =>
    allAccounts.find((a) => a.vaultIndex === idx)?.name ?? `Vault #${idx}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vaults/${multisig}/spending-limits`);
      if (res.ok) setLimits(await res.json());
    } finally {
      setLoading(false);
    }
  }, [multisig]);

  useEffect(() => {
    load();
  }, [load]);

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
    const isNativeSol = formMint === SOL_MINT;
    const mintPk = isNativeSol ? PublicKey.default : new PublicKey(formMint);

    setCreating(true);
    try {
      const result = await createAddSpendingLimitProposal({
        connection,
        wallet: {
          ...wallet,
          publicKey: wallet.publicKey,
          sendTransaction: wallet.sendTransaction,
        },
        multisigPda: multisigPk,
        createKey,
        vaultIndex: formVaultIndex,
        mint: mintPk,
        amount: amountLamports,
        period: periodEnum,
        members: [wallet.publicKey],
        destinations: [],
      });

      await fetchWithAuth(`/api/vaults/${multisig}/spending-limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spendingLimit: result.spendingLimitPda.toBase58(),
          createKey: createKey.toBase58(),
          vaultIndex: formVaultIndex,
          mint: mintPk.toBase58(),
          amountRaw: amountLamports.toString(),
          period: formPeriod,
          members: [wallet.publicKey.toBase58()],
          destinations: [],
        }),
      });

      addToast(
        `Spending limit proposal #${result.transactionIndex} created. Members must approve.`,
        "success",
      );
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
    if (!confirm("Propose removal of this spending limit? Members must approve.")) return;
    try {
      await createRemoveSpendingLimitProposal({
        connection,
        wallet: {
          ...wallet,
          publicKey: wallet.publicKey,
          sendTransaction: wallet.sendTransaction,
        },
        multisigPda: new PublicKey(multisig),
        spendingLimitPda: new PublicKey(limit.spendingLimit),
      });
      await fetchWithAuth(`/api/vaults/${multisig}/spending-limits/${limit.id}`, {
        method: "DELETE",
      });
      addToast("Remove proposal submitted.", "success");
      await load();
    } catch (err) {
      addToast(String(err instanceof Error ? err.message : err), "error");
    }
  };

  const amountSol = parseFloat(formAmount);
  const validAmount = !isNaN(amountSol) && amountSol > 0;

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Spending limits"
        title="Spending Limits"
        description="Let authorized signers send up to a set amount without a full multisig vote. Requires member approval to activate."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left: active limits */}
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-xl border border-border bg-surface px-5 py-4">
              <p className="animate-pulse text-xs text-ink-subtle">Loading…</p>
            </div>
          ) : limits.length === 0 ? (
            <EmptyPanel
              title="No active spending limits"
              description="Add a spending limit to allow members to make small transfers without a proposal vote."
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowForm(true)}
                  className="border border-dashed border-border"
                >
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Add limit
                </Button>
              }
            />
          ) : (
            limits.map((lim) => (
              <div
                key={lim.id}
                className="rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg",
                        lim.onChainExists === false ? "bg-signal-warn/10" : "bg-accent/10",
                      )}>
                        <Zap className={cn(
                          "h-4 w-4",
                          lim.onChainExists === false ? "text-signal-warn" : "text-accent",
                        )} />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-display text-xl font-semibold tabular-nums text-ink">
                            {lamportsToSol(lim.amountRaw)} SOL
                          </p>
                          {lim.onChainExists === false && (
                            <span className="rounded-full bg-signal-warn/10 px-2 py-0.5 text-[10px] font-semibold text-signal-warn">
                              Pending approval
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-muted">
                          {periodLabel(lim.period)} · from{" "}
                          <span className="font-medium text-ink">{accountNameByIndex(lim.vaultIndex)}</span>
                        </p>
                      </div>
                    </div>
                    <p className="font-mono text-[10px] text-ink-subtle">
                      {lim.spendingLimit.slice(0, 12)}…{lim.spendingLimit.slice(-8)}
                    </p>
                    <p className="text-[11px] text-ink-subtle">
                      {lim.members.length} signer{lim.members.length !== 1 ? "s" : ""}
                      {" · "}
                      {lim.destinations.length === 0
                        ? "any destination"
                        : `${lim.destinations.length} destinations`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(lim)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-signal-error"
                    aria-label="Remove spending limit"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: create form (sticky) */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-3">
          <Panel>
            <PanelHeader
              icon={Zap}
              title="New spending limit"
              description="Authorized signers can send up to this amount."
            />
            <PanelBody className="space-y-4">
              {showForm ? (
                <>
                  {subVaultAccounts.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Apply to</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {allAccounts.map((acct) => (
                          <button
                            key={acct.vaultIndex}
                            type="button"
                            onClick={() => setFormVaultIndex(acct.vaultIndex)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                              formVaultIndex === acct.vaultIndex
                                ? "border-accent/40 bg-accent/10 text-accent"
                                : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
                            )}
                          >
                            {acct.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="sl-amount">Amount (SOL)</Label>
                    <Input
                      id="sl-amount"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="5.0"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="font-display text-base"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Resets every</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {PERIODS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setFormPeriod(p)}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors",
                            formPeriod === p
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
                          )}
                        >
                          {PERIOD_LABELS[p]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {validAmount && (
                    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
                      <p className="text-xs text-ink-muted">
                        Members can send up to{" "}
                        <span className="font-semibold text-ink">{amountSol} SOL</span>{" "}
                        {periodLabel(formPeriod)} from{" "}
                        <span className="font-semibold text-ink">{accountNameByIndex(formVaultIndex)}</span>{" "}
                        without a proposal.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreate}
                      disabled={creating || !validAmount}
                      size="sm"
                      className="flex-1"
                    >
                      {creating ? "Creating proposal…" : "Create proposal"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowForm(false);
                        setFormAmount("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-left text-xs font-medium text-ink-subtle transition-colors hover:border-border-strong hover:text-ink"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Add spending limit
                </button>
              )}
            </PanelBody>
          </Panel>

          <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-ink">How it works</p>
            <ul className="space-y-1.5 text-[11px] text-ink-muted">
              <li>• Creating a limit opens a multisig proposal</li>
              <li>• Members must reach threshold to activate it</li>
              <li>• Once active, authorized signers can send without voting</li>
              <li>• The limit resets on the schedule you choose</li>
              <li>• v1: public sends only (Cloak routing in v2)</li>
            </ul>
          </div>
        </div>
      </div>
    </WorkspacePage>
  );
}

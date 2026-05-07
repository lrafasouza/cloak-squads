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
import { SendModal } from "@/components/vault/SendModal";
import { useVaultData } from "@/lib/use-vault-data";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
import { PublicKey } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import { ArrowUpFromLine, Check, Copy, Layers, Plus, Trash2 } from "lucide-react";
import { use, useCallback, useEffect, useState } from "react";

type SubVault = {
  id: string;
  cofreAddress: string;
  vaultIndex: number;
  name: string;
  color: string | null;
  icon: string | null;
};

function deriveVaultPda(multisigAddress: string, index: number): string {
  try {
    const multisigPk = new PublicKey(multisigAddress);
    const [pda] = multisigSdk.getVaultPda({ multisigPda: multisigPk, index });
    return pda.toBase58();
  } catch {
    return "–";
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-ink"
      aria-label="Copy address"
    >
      {copied ? <Check className="h-3 w-3 text-signal-positive" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function VaultCard({
  name,
  address,
  badge,
  balanceSol,
  onDelete,
  onSend,
}: {
  name: string;
  address: string;
  badge?: string;
  balanceSol?: string;
  onDelete?: () => void;
  onSend?: () => void;
}) {
  const short = address !== "–" ? `${address.slice(0, 14)}…${address.slice(-8)}` : "–";

  const hasFunds = balanceSol !== undefined && Number.parseFloat(balanceSol) > 0;

  return (
    <div className="card-panel px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">{name}</p>
            {badge && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                {badge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <p className="font-mono text-[11px] text-ink-subtle">{short}</p>
            {address !== "–" && <CopyButton text={address} />}
          </div>
          <p className="text-[10px] text-ink-subtle/60">
            Receive-only address. Send funds here to deposit into this account.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {balanceSol !== undefined && (
            <span
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                hasFunds ? "text-ink" : "text-ink-subtle/50",
              )}
            >
              {hasFunds
                ? Number.parseFloat(balanceSol).toLocaleString("en-US", {
                    maximumFractionDigits: 4,
                  })
                : "0"}{" "}
              <span className="text-xs font-normal text-ink-subtle">SOL</span>
            </span>
          )}
          <div className="flex items-center gap-1">
            {onSend && (
              <button
                type="button"
                onClick={onSend}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-accent-soft hover:text-accent"
                aria-label={`Send from ${name}`}
              >
                <ArrowUpFromLine className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-signal-danger"
                aria-label={`Remove ${name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubVaultsPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { fetchWithAuth } = useWalletAuth();
  const { addToast } = useToast();
  const { data: vaultData } = useVaultData(multisig);

  const [subVaults, setSubVaults] = useState<SubVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [sendVaultIndex, setSendVaultIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vaults/${multisig}/sub-vaults`);
      if (res.ok) setSubVaults(await res.json());
    } finally {
      setLoading(false);
    }
  }, [multisig]);

  useEffect(() => {
    load();
  }, [load]);

  const nextIndex =
    subVaults.length > 0 ? Math.max(...subVaults.map((sv) => sv.vaultIndex)) + 1 : 1;

  const previewAddress = newName.trim() ? deriveVaultPda(multisig, nextIndex) : null;

  const handleCreate = async () => {
    if (!newName.trim()) {
      addToast("Enter a name for the account.", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetchWithAuth(`/api/vaults/${multisig}/sub-vaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultIndex: nextIndex, name: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to create account.");
      }
      addToast("Account created.", "success");
      setNewName("");
      setShowForm(false);
      await load();
    } catch (err) {
      addToast(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (vaultIndex: number, name: string) => {
    const breakdown = vaultData?.subVaultBreakdown.find((b) => b.vaultIndex === vaultIndex);
    const bal = Number.parseFloat(breakdown?.balanceSol ?? "0");
    if (bal > 0) {
      addToast(
        `"${name}" holds ${bal.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL. Send funds to another account first, then remove the label.`,
        "error",
      );
      return;
    }
    if (!confirm(`Remove "${name}"? This only deletes the label, on-chain funds are unaffected.`))
      return;
    try {
      const res = await fetchWithAuth(`/api/vaults/${multisig}/sub-vaults/${vaultIndex}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to remove.");
      }
      addToast("Account removed.", "success");
      await load();
    } catch (err) {
      addToast(String(err instanceof Error ? err.message : err), "error");
    }
  };

  const primaryAddress = deriveVaultPda(multisig, 0);

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Accounts"
        title="Accounts"
        description="Each account is a separate on-chain address derived from your multisig. Label and fund them independently for treasury, grants, or operations."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: vault list */}
        <div className="space-y-3">
          <VaultCard
            name="Primary"
            address={primaryAddress}
            badge="Default"
            onSend={() => setSendVaultIndex(0)}
            {...(vaultData?.primaryBalanceSol !== undefined
              ? { balanceSol: vaultData.primaryBalanceSol }
              : {})}
          />

          {loading ? (
            <div className="card-panel px-5 py-4">
              <p className="animate-pulse text-xs text-ink-subtle">Loading accounts…</p>
            </div>
          ) : subVaults.length === 0 ? (
            <EmptyPanel
              title="No additional accounts"
              description="Add an account to separate your funds, for example a dedicated treasury or ops balance."
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowForm(true)}
                  className="border border-dashed border-border"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add account
                </Button>
              }
            />
          ) : (
            subVaults.map((sv) => (
              <VaultCard
                key={sv.id}
                name={sv.name}
                address={deriveVaultPda(multisig, sv.vaultIndex)}
                onDelete={() => handleDelete(sv.vaultIndex, sv.name)}
                onSend={() => setSendVaultIndex(sv.vaultIndex)}
                {...(() => {
                  const b = vaultData?.subVaultBreakdown.find(
                    (x) => x.vaultIndex === sv.vaultIndex,
                  );
                  return b ? { balanceSol: b.balanceSol } : {};
                })()}
              />
            ))
          )}
        </div>

        {/* Right: create panel (sticky) */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-3">
          <Panel>
            <PanelHeader
              icon={Layers}
              title="Add account"
              description="Gets its own on-chain address."
            />
            <PanelBody className="space-y-4">
              {showForm ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="sv-name">Account name</Label>
                    <Input
                      id="sv-name"
                      placeholder="Treasury, Grants, Ops…"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreate();
                      }}
                      autoFocus
                    />
                  </div>

                  {previewAddress && (
                    <div className="rounded-list border border-border bg-bg/40 px-3 py-2 space-y-0.5">
                      <p className="text-eyebrow">Address preview</p>
                      <div className="flex items-center gap-1">
                        <p className="font-mono text-[11px] text-ink">
                          {previewAddress.slice(0, 16)}…{previewAddress.slice(-8)}
                        </p>
                        <CopyButton text={previewAddress} />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreate}
                      disabled={creating || !newName.trim()}
                      size="sm"
                      className="flex-1"
                    >
                      {creating ? "Creating…" : "Create account"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowForm(false);
                        setNewName("");
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
                  className="flex w-full items-center gap-2 rounded-list border border-dashed border-border px-4 py-3 text-left text-xs font-medium text-ink-subtle transition-aegis hover:border-border-strong hover:text-ink"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  New account
                </button>
              )}
            </PanelBody>
          </Panel>

          <div className="card-panel px-4 py-3 space-y-2">
            <p className="text-eyebrow">Important</p>
            <ul className={cn("space-y-1.5 text-[11px] text-ink-muted")}>
              <li>
                • These are <strong className="text-ink">sub-accounts</strong> of this vault, not
                separate vaults
              </li>
              <li>• You cannot "enter" them; manage everything from this vault</li>
              <li>• Copy the address and send SOL/tokens to fund it</li>
              <li>• Names are off-chain labels; removing one doesn't affect funds</li>
            </ul>
          </div>
        </div>
      </div>

      <SendModal
        multisig={multisig}
        open={sendVaultIndex !== null}
        onOpenChange={(v) => {
          if (!v) setSendVaultIndex(null);
        }}
        defaultVaultIndex={sendVaultIndex ?? 0}
        subVaultAccounts={subVaults.map((sv) => ({ vaultIndex: sv.vaultIndex, name: sv.name }))}
      />
    </WorkspacePage>
  );
}

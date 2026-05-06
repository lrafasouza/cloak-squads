"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { WorkspaceHeader, WorkspacePage } from "@/components/ui/workspace";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { PublicKey } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import { Plus, Trash2 } from "lucide-react";
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

export default function SubVaultsPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { fetchWithAuth } = useWalletAuth();
  const { addToast } = useToast();

  const [subVaults, setSubVaults] = useState<SubVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIndex, setNewIndex] = useState("");
  const [showForm, setShowForm] = useState(false);

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

  const handleCreate = async () => {
    const idx = Number(newIndex);
    if (!newName.trim() || !Number.isInteger(idx) || idx < 1) {
      addToast("Enter a valid name and index (≥ 1).", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetchWithAuth(`/api/vaults/${multisig}/sub-vaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultIndex: idx, name: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create sub-vault.");
      }
      addToast("Sub-vault created.", "success");
      setNewName("");
      setNewIndex("");
      setShowForm(false);
      await load();
    } catch (err) {
      addToast(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (vaultIndex: number, name: string) => {
    if (!confirm(`Delete sub-vault "${name}"? This only removes the label — funds on-chain are unaffected.`)) return;
    try {
      const res = await fetchWithAuth(`/api/vaults/${multisig}/sub-vaults/${vaultIndex}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete.");
      }
      addToast("Sub-vault removed.", "success");
      await load();
    } catch (err) {
      addToast(String(err instanceof Error ? err.message : err), "error");
    }
  };

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Sub-vaults"
        title="Vault PDAs"
        description="Named vault PDAs within this multisig. Each index is a separate on-chain PDA — fund it directly to use it."
      />

      <div className="space-y-3">
        {/* Main vault (index 0) always shown */}
        <div className="rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-ink">Main (index 0)</p>
              <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">
                {deriveVaultPda(multisig, 0)}
              </p>
            </div>
            <span className="rounded-full bg-signal-success/10 px-2.5 py-0.5 text-[10px] font-semibold text-signal-success">
              Default
            </span>
          </div>
        </div>

        {/* Named sub-vaults */}
        {loading ? (
          <p className="px-1 text-xs text-ink-subtle">Loading…</p>
        ) : (
          subVaults.map((sv) => (
            <div
              key={sv.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4"
            >
              <div>
                <p className="text-sm font-semibold text-ink">
                  {sv.name}{" "}
                  <span className="text-ink-subtle">(index {sv.vaultIndex})</span>
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">
                  {deriveVaultPda(multisig, sv.vaultIndex)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(sv.vaultIndex, sv.name)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-2 hover:text-signal-error"
                aria-label={`Delete ${sv.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}

        {/* Create form */}
        {showForm ? (
          <div className="rounded-xl border border-border bg-surface px-5 py-4 space-y-3">
            <p className="text-sm font-semibold text-ink">New sub-vault</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sv-name">Name</Label>
                <Input
                  id="sv-name"
                  placeholder="Ops, Grants, Treasury…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sv-index">Index (≥ 1)</Label>
                <Input
                  id="sv-index"
                  type="number"
                  min={1}
                  max={255}
                  placeholder="1"
                  value={newIndex}
                  onChange={(e) => setNewIndex(e.target.value)}
                />
              </div>
            </div>
            {newIndex && Number.isInteger(Number(newIndex)) && Number(newIndex) >= 1 && (
              <p className="font-mono text-[10px] text-ink-subtle">
                PDA: {deriveVaultPda(multisig, Number(newIndex))}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating} size="sm">
                {creating ? "Creating…" : "Create"}
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
            Add sub-vault
          </button>
        )}
      </div>
    </WorkspacePage>
  );
}

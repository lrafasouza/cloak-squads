"use client";

import { AddressPill } from "@/components/ui/address-pill";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useToast } from "@/components/ui/toast-provider";
import { WarningCallout } from "@/components/ui/warning-callout";
import { StatusPill, WorkspaceHeader, WorkspacePage } from "@/components/ui/workspace";
import { truncateAddress } from "@/lib/proposals";
import { createSetTimeLockProposal } from "@/lib/squads-sdk";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { type VaultMetadata, useVaultMetadata } from "@/lib/use-vault-metadata";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Key, Loader2, Lock, Pencil } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useState } from "react";

function formatTimeLock(seconds: number): string {
  if (seconds === 0) return "Disabled";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = seconds / 3600;
  if (hours < 24) {
    return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  }
  const days = hours / 24;
  return Number.isInteger(days) ? `${days}d` : `${days.toFixed(1)}d`;
}

// ── Section ────────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

// ── SettingRow ─────────────────────────────────────────────────────────────

function SettingRow({
  label,
  value,
  action,
}: {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="mt-0.5 text-xs text-ink-muted">{value}</div>
      </div>
      {action && <div className="ml-4 shrink-0">{action}</div>}
    </div>
  );
}

// ── InlineEditField ────────────────────────────────────────────────────────

function InlineEditField({
  label,
  value,
  placeholder,
  maxLength,
  multiline,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  onSave: (val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-between px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className={cn("mt-0.5 text-xs", value ? "text-ink-muted" : "text-ink-subtle italic")}>
            {value || placeholder || "Not set"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="ml-4 flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-3.5">
      <p className="text-sm font-medium text-ink">{label}</p>
      <div className="mt-2 space-y-2">
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
        ) : (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft);
                setEditing(false);
              } catch {
                /* toast handles it */
              } finally {
                setSaving(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
          {maxLength && (
            <span className="ml-auto text-[10px] text-ink-subtle">
              {draft.length}/{maxLength}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ComingSoonBadge ────────────────────────────────────────────────────────

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent">
      <Lock className="h-2.5 w-2.5" />
      Soon
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SettingsPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const { data, isLoading } = useVaultData(multisig);
  const { data: metadata, isLoading: metaLoading } = useVaultMetadata(multisig);
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { connection } = useConnection();
  const wallet = useWallet();
  const [timeLockHoursDraft, setTimeLockHoursDraft] = useState<number | null>(null);
  const [applyingTimeLock, setApplyingTimeLock] = useState(false);

  const patchVault = useCallback(
    async (patch: Record<string, unknown>) => {
      const res = await fetchWithAuth(`/api/vaults/${encodeURIComponent(multisig)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to update");
      }
      const updated = (await res.json()) as VaultMetadata;
      await queryClient.invalidateQueries({ queryKey: ["vault-metadata", multisig] });
      await queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
      await queryClient.invalidateQueries({ queryKey: ["my-vaults"] });
      return updated;
    },
    [fetchWithAuth, multisig, queryClient],
  );

  const handleApplyTimeLock = useCallback(
    async (newSeconds: number) => {
      if (!wallet.publicKey || !wallet.sendTransaction) {
        addToast("Connect a member wallet to apply.", "error");
        return;
      }
      setApplyingTimeLock(true);
      try {
        await createSetTimeLockProposal({
          connection,
          wallet: { publicKey: wallet.publicKey, sendTransaction: wallet.sendTransaction },
          multisigPda: new PublicKey(multisig),
          timeLockSeconds: newSeconds,
        });
        addToast(
          newSeconds === 0
            ? "Proposal created to disable time lock."
            : `Proposal created to set time lock to ${newSeconds}s.`,
          "success",
        );
        await queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
        setTimeLockHoursDraft(null);
      } catch (e) {
        addToast(e instanceof Error ? e.message : "Failed to create proposal", "error");
      } finally {
        setApplyingTimeLock(false);
      }
    },
    [addToast, connection, multisig, queryClient, wallet.publicKey, wallet.sendTransaction],
  );

  if (isLoading || metaLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-ink-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading settings…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <WarningCallout variant="error">Failed to load vault data.</WarningCallout>
      </div>
    );
  }

  const vaultName = metadata?.name || "";
  const vaultDescription = metadata?.description || "";

  return (
    <WorkspacePage>
      <WorkspaceHeader eyebrow="VAULT" title="Settings" description={truncateAddress(multisig)} />

      <div className="space-y-4">
        {/* General */}
        <Section title="General" description="Vault identity and metadata">
          <InlineEditField
            label="Vault name"
            value={vaultName}
            placeholder="Enter a name for this vault"
            maxLength={32}
            onSave={async (val) => {
              try {
                await patchVault({ name: val.trim() || "Untitled" });
                addToast("Vault name updated", "success");
              } catch (e) {
                addToast(e instanceof Error ? e.message : "Failed to update name", "error");
                throw e;
              }
            }}
          />
          <InlineEditField
            label="Description"
            value={vaultDescription}
            placeholder="What is this vault for?"
            maxLength={64}
            multiline
            onSave={async (val) => {
              try {
                await patchVault({ description: val.trim() || null });
                addToast("Description updated", "success");
              } catch (e) {
                addToast(e instanceof Error ? e.message : "Failed to update description", "error");
                throw e;
              }
            }}
          />
          <SettingRow label="Vault address" value={<AddressPill value={multisig} chars={8} />} />
          <SettingRow
            label="Privacy vault"
            value={data.cofreInitialized ? "Gatekeeper initialized" : "Not initialized"}
            action={
              <StatusPill tone={data.cofreInitialized ? "success" : "neutral"}>
                {data.cofreInitialized ? "Active" : "Inactive"}
              </StatusPill>
            }
          />
        </Section>

        {/* Members & Threshold */}
        <Section title="Members & Threshold" description="Vault membership and approval rules">
          <SettingRow
            label="Members"
            value={`${data.memberCount} signers`}
            action={
              <Link
                href={`/vault/${multisig}/members`}
                className="rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow"
              >
                Manage
              </Link>
            }
          />
          <SettingRow
            label="Threshold"
            value={`${data.threshold} of ${data.memberCount} signatures required`}
            action={
              <span className="text-xs text-ink-subtle">
                {Math.round((data.threshold / data.memberCount) * 100)}%
              </span>
            }
          />
        </Section>

        {/* Security */}
        <Section title="Security" description="Cooling period between approval and execution">
          <SettingRow
            label="Time lock"
            value={
              data.timeLock === 0
                ? "Disabled — proposals execute immediately on threshold."
                : `${formatTimeLock(data.timeLock)} between approval and execution.`
            }
            action={
              <StatusPill tone={data.timeLock > 0 ? "accent" : "neutral"}>
                {data.timeLock === 0 ? "Off" : "On"}
              </StatusPill>
            }
          />
          <div className="px-5 py-3.5">
            <p className="text-sm font-medium text-ink">Adjust time lock</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Members get a window to spot and cancel a compromised approval. Range: 0 to 168 hours
              (7 days). Changes require multisig approval.
            </p>
            <input
              id="timelock-slider"
              type="range"
              min={0}
              max={168}
              step={1}
              value={timeLockHoursDraft ?? Math.round(data.timeLock / 3600)}
              onChange={(e) => setTimeLockHoursDraft(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
              aria-label="Time lock hours"
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="font-mono text-ink">
                {timeLockHoursDraft === null
                  ? data.timeLock === 0
                    ? "Disabled"
                    : `${Math.round(data.timeLock / 3600)}h`
                  : timeLockHoursDraft === 0
                    ? "Disabled"
                    : `${timeLockHoursDraft}h`}
              </span>
              <span className="text-ink-subtle">
                Current: {data.timeLock === 0 ? "Disabled" : formatTimeLock(data.timeLock)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (timeLockHoursDraft === null) return;
                void handleApplyTimeLock(timeLockHoursDraft * 3600);
              }}
              disabled={
                applyingTimeLock ||
                timeLockHoursDraft === null ||
                timeLockHoursDraft * 3600 === data.timeLock
              }
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {applyingTimeLock ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              {applyingTimeLock ? "Creating proposal…" : "Apply (creates a proposal)"}
            </button>
          </div>
        </Section>

        {/* Privacy */}
        <Section title="Privacy" description="Shielded transactions and audit access">
          <SettingRow
            label="Shielded balance"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-ink-subtle" />
                Viewing keys managed per vault
              </span>
            }
            action={
              <StatusPill tone={data.cofreInitialized ? "success" : "neutral"}>
                {data.cofreInitialized ? "Initialized" : "Not set up"}
              </StatusPill>
            }
          />
          <SettingRow
            label="Audit links"
            value="Scoped read-only access for auditors"
            action={
              <Link
                href={`/vault/${multisig}/audit`}
                className="rounded-md bg-gradient-to-r from-accent to-accent-hover px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow"
              >
                Open
              </Link>
            }
          />
        </Section>

        {/* Appearance */}
        <Section title="Appearance" description="Theme and visual preferences">
          <SettingRow
            label="Theme"
            value="Follow your system preference, or pin to Heraldic Light or Dark"
            action={<ThemeToggle size="md" />}
          />
        </Section>

        {/* Notifications */}
        <Section title="Notifications" description="Alerts for proposal events">
          <SettingRow
            label="Email notifications"
            value="Receive alerts when proposals are created or executed"
            action={<ComingSoonBadge />}
          />
          <SettingRow
            label="Webhook URL"
            value="Post proposal events to an external endpoint"
            action={<ComingSoonBadge />}
          />
        </Section>

        {/* Developers */}
        <Section title="Developers" description="API access and integrations">
          <SettingRow
            label="API keys"
            value="Programmatic access to proposals and vault data"
            action={<ComingSoonBadge />}
          />
          <SettingRow
            label="RPC override"
            value="Use a custom RPC endpoint for this vault"
            action={<ComingSoonBadge />}
          />
        </Section>
      </div>
    </WorkspacePage>
  );
}

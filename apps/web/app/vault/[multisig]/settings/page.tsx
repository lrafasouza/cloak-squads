"use client";

import { AddressPill } from "@/components/ui/address-pill";
import { useToast } from "@/components/ui/toast-provider";
import { StatCard } from "@/components/ui/stat-card";
import { WarningCallout } from "@/components/ui/warning-callout";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { useVaultMetadata, type VaultMetadata } from "@/lib/use-vault-metadata";
import { cn } from "@/lib/utils";
import { useVaultData } from "@/lib/use-vault-data";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { truncateAddress } from "@/lib/proposals";
import {
  Check,
  Key,
  Loader2,
  Lock,
  Pencil,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

function ToggleSwitch({
  checked,
  disabled,
}: {
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-surface-3",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <div
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform duration-200",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </div>
  );
}

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
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-xs text-ink-subtle">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

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
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="mt-0.5 text-xs text-ink-muted">{value}</div>
      </div>
      {action && <div className="shrink-0 ml-3">{action}</div>}
    </div>
  );
}

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
      <div className="flex items-center justify-between py-3 border-b border-border">
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
          className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="py-3 border-b border-border">
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
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
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

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent">
      <Lock className="h-2.5 w-2.5" />
      Soon
    </span>
  );
}

export default function SettingsPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const { data, isLoading } = useVaultData(multisig);
  const { data: proposals = [] } = useProposalSummaries(multisig);
  const { data: metadata, isLoading: metaLoading } = useVaultMetadata(multisig);
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const activeProposals = proposals.filter((p) => p.status === "active").length;

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

  if (isLoading || metaLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-ink-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading settings...
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
  const webhookUrl = metadata?.settings?.webhookUrl || "";
  const rpcOverride = metadata?.settings?.rpcOverride || "";

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-xs text-ink-muted">{truncateAddress(multisig)}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={data.memberCount} icon={Users} />
        <StatCard
          label="Threshold"
          value={`${data.threshold}/${data.memberCount}`}
          icon={Shield}
          sub={`${Math.round((data.threshold / data.memberCount) * 100)}% required`}
        />
        <StatCard
          label="Active Proposals"
          value={activeProposals}
          icon={Shield}
          sub={activeProposals > 0 ? "Awaiting approval" : "None"}
        />
      </div>

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
          label="Privacy status"
          value={
            data.cofreInitialized ? "Initialized — gatekeeper active" : "Not initialized"
          }
        />
        <SettingRow label="Balance" value={`${data.balanceSol} SOL · ${data.usdcUi} USDC`} />
      </Section>

      <Section title="Members & Threshold" description="Manage vault membership and security">
        <SettingRow
          label="Members"
          value={`${data.memberCount} signers`}
          action={
            <Link
              href={`/vault/${multisig}/members`}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Manage
            </Link>
          }
        />
        <SettingRow label="Threshold" value={`${data.threshold} signatures required`} />
      </Section>

      <Section title="Privacy" description="Shielded transactions and viewing keys">
        <SettingRow
          label="Shielded balance"
          value={
            <span className="inline-flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-ink-subtle" />
              Viewing keys managed per vault
            </span>
          }
          action={<ToggleSwitch checked={data.cofreInitialized} disabled />}
        />
        <SettingRow
          label="Audit links"
          value="Scoped read-only access for auditors"
          action={
            <Link
              href={`/vault/${multisig}/audit`}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Open
            </Link>
          }
        />
      </Section>

      <Section title="Notifications" description="Alerts for proposal events">
        <SettingRow
          label="Email notifications"
          value="Receive alerts when proposals are created or executed"
          action={<ComingSoonBadge />}
        />
        <InlineEditField
          label="Webhook URL"
          value={webhookUrl}
          placeholder="https://your-server.com/webhook"
          onSave={async (val) => {
            try {
              await patchVault({ webhookUrl: val.trim() || null });
              addToast("Webhook URL updated", "success");
            } catch (e) {
              addToast(e instanceof Error ? e.message : "Failed to update webhook URL", "error");
              throw e;
            }
          }}
        />
      </Section>

      <Section title="Developers" description="API access and integrations">
        <SettingRow
          label="API keys"
          value="Programmatic access to proposals and vault data"
          action={<ComingSoonBadge />}
        />
        <InlineEditField
          label="RPC override"
          value={rpcOverride}
          placeholder="https://your-rpc.com"
          onSave={async (val) => {
            try {
              await patchVault({ rpcOverride: val.trim() || null });
              addToast("RPC override updated", "success");
            } catch (e) {
              addToast(e instanceof Error ? e.message : "Failed to update RPC override", "error");
              throw e;
            }
          }}
        />
      </Section>
    </div>
  );
}

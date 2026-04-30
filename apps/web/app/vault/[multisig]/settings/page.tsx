"use client";

import { AddressPill } from "@/components/ui/address-pill";
import { StatCard } from "@/components/ui/stat-card";
import { WarningCallout } from "@/components/ui/warning-callout";
import { useVaultData } from "@/lib/use-vault-data";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { truncateAddress } from "@/lib/proposals";
import { Key, Loader2, Shield, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-xs text-ink-subtle">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SettingRow({ label, value, action }: { label: string; value: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="mt-0.5 text-xs text-ink-muted">{value}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default function SettingsPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const { data, isLoading } = useVaultData(multisig);
  const { data: proposals = [] } = useProposalSummaries(multisig);
  const [clearingRecent, setClearingRecent] = useState(false);

  const activeProposals = proposals.filter((p) => p.status === "active").length;

  if (isLoading) {
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

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-xs text-ink-muted">{truncateAddress(multisig)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={data.memberCount} icon={Users} />
        <StatCard label="Threshold" value={`${data.threshold}/${data.memberCount}`} icon={Shield} sub={`${Math.round((data.threshold / data.memberCount) * 100)}% required`} />
        <StatCard label="Active Proposals" value={activeProposals} icon={Shield} sub={activeProposals > 0 ? "Awaiting approval" : "None"} className="col-span-2 sm:col-span-1" />
      </div>

      <Section title="General" description="Vault identity and metadata">
        <SettingRow label="Vault address" value={<AddressPill value={multisig} chars={8} />} />
        <SettingRow label="Privacy status" value={data.cofreInitialized ? "Initialized — gatekeeper active" : "Not initialized"} />
        <SettingRow label="Balance" value={`${data.balanceSol} SOL`} />
      </Section>

      <Section title="Members & Threshold" description="Manage vault membership and security">
        <SettingRow label="Members" value={`${data.memberCount} signers`} action={<Link href={`/vault/${multisig}/members`} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover">Manage</Link>} />
        <SettingRow label="Threshold" value={`${data.threshold} signatures required`} />
      </Section>

      <Section title="Privacy" description="Shielded transactions and viewing keys">
        <SettingRow label="Shielded balance" value={<span className="inline-flex items-center gap-1.5"><Key className="h-3.5 w-3.5 text-ink-subtle" />Viewing keys managed per vault</span>} action={<span className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-muted">Coming soon</span>} />
        <SettingRow label="Audit links" value="Scoped read-only access for auditors" action={<Link href={`/vault/${multisig}/audit`} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover">Open</Link>} />
      </Section>

      <Section title="Notifications" description="Alerts for proposal events">
        <SettingRow label="Email notifications" value="Receive alerts when proposals are created or executed" action={<span className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-muted">Coming soon</span>} />
        <SettingRow label="Webhook URL" value="POST events to your endpoint" action={<span className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-muted">Coming soon</span>} />
      </Section>

      <Section title="Developers" description="API access and integrations">
        <SettingRow label="API keys" value="Programmatic access to proposals and vault data" action={<span className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-muted">Coming soon</span>} />
        <SettingRow label="RPC override" value="Custom Solana RPC endpoint for this vault" action={<span className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-muted">Coming soon</span>} />
      </Section>

      <Section title="Danger Zone" description="Irreversible local actions">
        <div className="space-y-3">
          <WarningCallout variant="warning">These actions only affect local data. On-chain vaults cannot be deleted.</WarningCallout>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Remove from recent vaults</p>
              <p className="text-xs text-ink-subtle">Stop showing this vault in the sidebar selector</p>
            </div>
            <button type="button" onClick={() => { try { const stored = JSON.parse(localStorage.getItem("aegis:recent-vaults") || "[]"); const filtered = stored.filter((v: string) => v !== multisig); localStorage.setItem("aegis:recent-vaults", JSON.stringify(filtered)); setClearingRecent(true); setTimeout(() => setClearingRecent(false), 1500); } catch { /* ignore */ } }} className="inline-flex items-center gap-1.5 rounded-md border border-signal-danger/30 bg-signal-danger/10 px-3 py-1.5 text-xs font-medium text-signal-danger transition-colors hover:bg-signal-danger/15">
              {clearingRecent ? "Cleared" : <><Trash2 className="h-3.5 w-3.5" />Remove</>}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}

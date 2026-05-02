"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { CofreInitBanner } from "@/components/vault/CofreInitBanner";
import { OverviewCard } from "@/components/vault/OverviewCard";
import { PendingProposalsCard } from "@/components/vault/PendingProposalsCard";
import { QuickActionBar } from "@/components/vault/QuickActionBar";
import { RecentActivityCard } from "@/components/vault/RecentActivityCard";
import { useRecentActivity } from "@/lib/hooks/useRecentActivity";
import { truncateAddress } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Shield, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

function DashboardVaultIdentity({ multisig }: { multisig: string }) {
  const [vaultName, setVaultName] = useState<string | undefined>();
  const [copiedAddress, setCopiedAddress] = useState(false);

  useEffect(() => {
    if (!multisig) {
      setVaultName(undefined);
      return;
    }

    let cancelled = false;
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
      <h1 className="text-xl font-semibold tracking-tight text-ink">Dashboard</h1>
      <div className="group/address mt-0.5 flex items-center gap-1.5">
        <p className="font-mono text-[11px]">
          {/* default: vault name (or address if no name) */}
          <span className="inline text-ink-muted group-hover/address:hidden">
            {vaultName || truncateAddress(multisig)}
          </span>
          {/* hover: address only */}
          <span className="hidden text-ink-subtle group-hover/address:inline">
            {truncateAddress(multisig)}
          </span>
        </p>
        <button
          type="button"
          onClick={handleCopyAddress}
          className="flex h-5 w-5 items-center justify-center rounded text-ink-subtle opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover/address:opacity-100"
          aria-label="Copy vault address"
          title={copiedAddress ? "Copied" : multisig}
        >
          {copiedAddress ? (
            <Check className="h-3 w-3 text-accent" />
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
  const { activity, isLoading: activityLoading } = useRecentActivity(multisig, 5);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-12 w-48 shimmer-bg rounded-lg" />
        {/* Balance skeleton */}
        <div className="h-40 shimmer-bg rounded-2xl" />
        {/* Quick actions skeleton */}
        <div className="grid grid-cols-4 gap-3">
          <div className="h-24 shimmer-bg rounded-2xl" />
          <div className="h-24 shimmer-bg rounded-2xl" />
          <div className="h-24 shimmer-bg rounded-2xl" />
          <div className="h-24 shimmer-bg rounded-2xl" />
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-3 gap-3">
          <div className="h-24 shimmer-bg rounded-xl" />
          <div className="h-24 shimmer-bg rounded-xl" />
          <div className="h-24 shimmer-bg rounded-xl" />
        </div>
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
    <div className="space-y-6 p-6">
      {/* Header — identity row */}
      <div className="relative">
        {/* Subtle golden radial glow behind header */}
        <div className="pointer-events-none absolute -left-6 -top-6 h-32 w-64 bg-radial-fade opacity-60" />
        <div className="relative flex items-center gap-3">
          <div className="rounded-xl ring-1 ring-accent/20">
            <VaultIdenticon seed={multisig} size={44} className="rounded-xl" />
          </div>
          <DashboardVaultIdentity multisig={multisig} />
        </div>
      </div>

      {!data.cofreInitialized && <CofreInitBanner multisig={multisig} />}

      <OverviewCard
        multisig={multisig}
        balanceSol={data.balanceSol}
        cofreInitialized={data.cofreInitialized}
        onRefresh={refresh}
      />

      {/* Quick actions */}
      <QuickActionBar multisig={multisig} />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Members" value={data.memberCount} icon={Users} />
        <StatCard
          label="Threshold"
          value={`${data.threshold}/${data.memberCount}`}
          icon={Shield}
          sub={`${Math.round((data.threshold / data.memberCount) * 100)}%`}
        />
        <StatCard
          label="Cloak (Gatekeeper)"
          value={data.cofreInitialized ? "Active" : "Inactive"}
          icon={Wallet}
          sub={data.cofreInitialized ? "Protected" : "Pending"}
        />
      </div>

      {/* Pending proposals — below the main grid */}
      <PendingProposalsCard multisig={multisig} proposals={proposals} />

      {/* Activity — full width */}
      <RecentActivityCard
        multisig={multisig}
        activity={activity}
        isLoading={activityLoading}
      />
    </div>
  );
}

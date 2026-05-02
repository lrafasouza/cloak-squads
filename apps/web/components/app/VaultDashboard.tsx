"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { AccountsTab } from "@/components/vault/AccountsTab";
import { CofreInitBanner } from "@/components/vault/CofreInitBanner";
import { OverviewCard } from "@/components/vault/OverviewCard";
import { PendingProposalsCard } from "@/components/vault/PendingProposalsCard";
import { RecentActivityCard } from "@/components/vault/RecentActivityCard";
import { ShieldedTab } from "@/components/vault/ShieldedTab";
import { publicEnv } from "@/lib/env";
import { useRecentActivity } from "@/lib/hooks/useRecentActivity";
import { truncateAddress } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Shield, Users, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
      <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
      <div className="group/address mt-0.5 flex items-center gap-1.5">
        <p className="font-mono text-xs text-ink-muted">
          <span className={vaultName ? "group-hover/address:hidden" : undefined}>
            {vaultName || truncateAddress(multisig)}
          </span>
          {vaultName ? (
            <span className="hidden group-hover/address:inline">{truncateAddress(multisig)}</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={handleCopyAddress}
          className="flex h-5 w-5 items-center justify-center rounded text-ink-subtle opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover/address:opacity-100"
          aria-label="Copy vault address"
          title={copiedAddress ? "Copied" : multisig}
        >
          {copiedAddress ? (
            <Check className="h-3 w-3 text-signal-success" />
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
  const squadsProgram = useMemo(() => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID), []);
  const vaultAddress = useMemo(() => {
    try {
      const [vault] = squadsVaultPda(new PublicKey(multisig), squadsProgram);
      return vault.toBase58();
    } catch {
      return multisig;
    }
  }, [multisig, squadsProgram]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
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
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <VaultIdenticon seed={multisig} size={40} className="rounded-xl" />
        <DashboardVaultIdentity multisig={multisig} />
      </div>

      <PendingProposalsCard multisig={multisig} proposals={proposals} />

      <OverviewCard
        multisig={multisig}
        balanceSol={data.balanceSol}
        cofreInitialized={data.cofreInitialized}
        onRefresh={refresh}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={data.memberCount} icon={Users} />
        <StatCard
          label="Threshold"
          value={`${data.threshold}/${data.memberCount}`}
          icon={Shield}
          sub={`${Math.round((data.threshold / data.memberCount) * 100)}% required`}
        />
        <StatCard
          label="Cloak Protocol"
          value={data.cofreInitialized ? "Active" : "Inactive"}
          icon={Wallet}
          sub={data.cofreInitialized ? "Protected" : "Pending"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {!data.cofreInitialized && <CofreInitBanner multisig={multisig} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountsTab multisig={multisig} vaultAddress={vaultAddress} balanceSol={data.balanceSol} />
        <ShieldedTab multisig={multisig} />
      </div>

      <RecentActivityCard multisig={multisig} activity={activity} isLoading={activityLoading} />
    </div>
  );
}

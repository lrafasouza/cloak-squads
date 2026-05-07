"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { CofreInitBanner } from "@/components/vault/CofreInitBanner";
import { GovernanceRibbon } from "@/components/vault/GovernanceRibbon";
import { OverviewCard } from "@/components/vault/OverviewCard";
import { PendingProposalsCard } from "@/components/vault/PendingProposalsCard";
import { PrivacyFlowModal } from "@/components/vault/PrivacyFlowModal";
import { ReceiveModal } from "@/components/vault/ReceiveModal";
import { RecentActivityCard } from "@/components/vault/RecentActivityCard";
import { SendModal } from "@/components/vault/SendModal";
import { SwapModal } from "@/components/vault/SwapModal";
import { TreasuryFlowStrip } from "@/components/vault/TreasuryFlowStrip";
import { useRecentActivity } from "@/lib/hooks/useRecentActivity";
import { useVaultIncomeSync, vaultIncomeQueryKey } from "@/lib/hooks/useVaultIncome";
import { proposalSummariesQueryKey, useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";

export function VaultDashboard({ multisig }: { multisig: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useVaultData(multisig);
  const { data: proposals = [] } = useProposalSummaries(multisig);
  // Build the multisig's own address set once and share it with every consumer
  // that needs to distinguish "value entering the treasury" from "shuffle
  // between our own vaults". Keeping this in the dashboard avoids each child
  // re-deriving PDAs and ensures a single referential identity across renders.
  const internalAddresses = useMemo(() => {
    if (!data) return undefined;
    const addrs = new Set<string>();
    addrs.add(data.primaryVaultAddress);
    for (const sv of data.subVaultBreakdown) addrs.add(sv.address);
    return addrs;
  }, [data]);
  const { activity, isLoading: activityLoading } = useRecentActivity(
    multisig,
    5,
    internalAddresses,
  );
  // Single source of truth for the chain-driven income refresh. Mounting at
  // the dashboard root means a fresh deposit only triggers ONE WebSocket
  // subscription regardless of how many consumers (KPI strip, activity,
  // proposals page) read income data.
  useVaultIncomeSync(multisig);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [privacyFlowOpen, setPrivacyFlowOpen] = useState(false);

  // Refresh ALL vault-scoped queries: balance, income (KPIs and activity),
  // and proposal summaries. For income we hit the force-sync endpoint and
  // seed the cache directly with the response so we don't waste a second
  // round trip on the standard invalidate→refetch path.
  //
  // Failure handling: any non-OK response (notably 429 from the rate-limited
  // force endpoint) or a thrown fetch error falls back to a plain invalidate,
  // which causes the consumer to re-fetch the non-force endpoint. The user
  // still sees fresh data, just from the throttle-respecting path.
  const refresh = async () => {
    void queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
    void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
    let seeded = false;
    try {
      const res = await fetch(`/api/vaults/${multisig}/income?limit=200&force=true`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.entries) {
          queryClient.setQueryData(vaultIncomeQueryKey(multisig), data.entries);
          seeded = true;
        }
      }
    } catch {
      // fall through to invalidate
    }
    if (!seeded) {
      void queryClient.invalidateQueries({ queryKey: vaultIncomeQueryKey(multisig) });
    }
  };

  if (isLoading) {
    // Skeleton mirrors the new layout — Treasury Hero (taller),
    // asymmetric KPI ribbon (3/3/6), single-line Governance ribbon,
    // then proposal queue + activity. Heights match the rendered shells
    // so the swap doesn't shift content when data lands.
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="h-[260px] shimmer-bg rounded-hero" />
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="h-[148px] shimmer-bg rounded-panel lg:col-span-3" />
          <div className="h-[148px] shimmer-bg rounded-panel lg:col-span-3" />
          <div className="h-[148px] shimmer-bg rounded-panel lg:col-span-6" />
        </div>
        <div className="h-[72px] shimmer-bg rounded-panel" />
        <div className="h-32 shimmer-bg rounded-panel" />
        <div className="h-48 shimmer-bg rounded-list" />
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
    <div className="space-y-6 p-4 md:p-6">
      {!data.cofreInitialized && <CofreInitBanner multisig={multisig} />}

      <OverviewCard
        multisig={multisig}
        balanceSol={data.balanceSol}
        primaryBalanceSol={data.primaryBalanceSol}
        usdcUi={data.usdcUi}
        subVaultBreakdown={data.subVaultBreakdown}
        cofreInitialized={data.cofreInitialized}
        onRefresh={refresh}
        onReceive={() => setReceiveOpen(true)}
        onSend={() => setSendOpen(true)}
        onSwap={() => setSwapOpen(true)}
      />

      <TreasuryFlowStrip
        multisig={multisig}
        internalAddresses={internalAddresses}
        onPrivacyHelpClick={() => setPrivacyFlowOpen(true)}
      />

      <GovernanceRibbon
        multisig={multisig}
        threshold={data.threshold}
        memberCount={data.memberCount}
        members={data.members}
        timeLock={data.timeLock}
      />

      {/* Pending proposals — below the main grid */}
      <PendingProposalsCard multisig={multisig} proposals={proposals} />

      {/* Activity — full width */}
      <RecentActivityCard multisig={multisig} activity={activity} isLoading={activityLoading} />

      <PrivacyFlowModal open={privacyFlowOpen} onOpenChange={setPrivacyFlowOpen} />

      <ReceiveModal multisig={multisig} open={receiveOpen} onOpenChange={setReceiveOpen} />
      <SendModal
        multisig={multisig}
        open={sendOpen}
        onOpenChange={setSendOpen}
        subVaultAccounts={data.subVaultBreakdown.map((sv) => ({
          vaultIndex: sv.vaultIndex,
          name: sv.name,
        }))}
      />
      <SwapModal
        multisig={multisig}
        open={swapOpen}
        onOpenChange={setSwapOpen}
        subVaultAccounts={data.subVaultBreakdown.map((sv) => ({
          vaultIndex: sv.vaultIndex,
          name: sv.name,
        }))}
      />
    </div>
  );
}

"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { CofreInitBanner } from "@/components/vault/CofreInitBanner";
import { OverviewCard } from "@/components/vault/OverviewCard";
import { PendingProposalsCard } from "@/components/vault/PendingProposalsCard";
import { ReceiveModal } from "@/components/vault/ReceiveModal";
import { RecentActivityCard } from "@/components/vault/RecentActivityCard";
import { SendModal } from "@/components/vault/SendModal";
import { SwapModal } from "@/components/vault/SwapModal";
import { TreasuryFlowStrip } from "@/components/vault/TreasuryFlowStrip";
import { useRecentActivity } from "@/lib/hooks/useRecentActivity";
import { useVaultIncomeSync, vaultIncomeQueryKey } from "@/lib/hooks/useVaultIncome";
import { truncateAddress } from "@/lib/proposals";
import { proposalSummariesQueryKey, useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { useVaultMetadata } from "@/lib/use-vault-metadata";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Shield } from "lucide-react";
import { useMemo, useState } from "react";

function DashboardVaultIdentity({ multisig }: { multisig: string }) {
  const { data: vaultMeta } = useVaultMetadata(multisig);
  const vaultName = vaultMeta?.name || undefined;
  const [copiedAddress, setCopiedAddress] = useState(false);

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
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="flex h-5 w-5 items-center justify-center rounded text-ink-subtle opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover/address:opacity-100"
                aria-label="Copy vault address"
              >
                {copiedAddress ? (
                  <Check className="h-3 w-3 text-accent" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {copiedAddress
                ? "Copied"
                : "Multisig identifier (governance ID). For deposits, use the address shown below the balance."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

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
    // Skeleton mirrors the actual rendered layout so the page doesn't shift
    // sections around once data lands. Heights are approximate but close
    // enough that the swap is invisible to the eye.
    return (
      <div className="space-y-6 p-4 md:p-6">
        {/* Header identity row */}
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 shimmer-bg rounded-xl" />
          <div className="space-y-1.5">
            <div className="h-5 w-32 shimmer-bg rounded" />
            <div className="h-3 w-40 shimmer-bg rounded" />
          </div>
        </div>
        {/* OverviewCard */}
        <div className="h-[280px] shimmer-bg rounded-2xl" />
        {/* TreasuryFlowStrip — 3 KPI cards */}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="h-[148px] shimmer-bg rounded-2xl" />
          <div className="h-[148px] shimmer-bg rounded-2xl" />
          <div className="h-[148px] shimmer-bg rounded-2xl" />
        </div>
        {/* Governance + Cloak split */}
        <div className="h-[96px] shimmer-bg rounded-2xl" />
        {/* PendingProposalsCard + RecentActivityCard */}
        <div className="h-32 shimmer-bg rounded-2xl" />
        <div className="h-48 shimmer-bg rounded-2xl" />
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
      {/* Header — identity row */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl ring-1 ring-accent/20">
          <VaultIdenticon seed={multisig} size={44} className="rounded-xl" />
        </div>
        <DashboardVaultIdentity multisig={multisig} />
      </div>

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

      <TreasuryFlowStrip multisig={multisig} internalAddresses={internalAddresses} />

      {/* Governance + Cloak — split block, governance left, privacy right.
          Both sides describe vault attributes that don't change daily, so we
          keep the height tight (~96px desktop) and let the dynamic flow strip
          above carry the eye. */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface transition-colors duration-200 hover:border-accent/15">
        <div className="flex flex-col md:flex-row md:items-stretch">
          {/* GOVERNANCE side */}
          <div className="flex-1 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-eyebrow text-ink-subtle">Governance</p>
              <span className="text-[10px] tabular-nums text-ink-subtle/70">
                {data.memberCount} {data.memberCount === 1 ? "member" : "members"}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
                {data.threshold}
                <span className="text-ink-subtle/50">/{data.memberCount}</span>
              </p>
              <p className="text-xs text-ink-muted">required to approve</p>
            </div>
            {/* Threshold dots only earn their space when there are at least
                two members to compare against. A single dot for a 1-of-1
                vault adds noise without information. */}
            {data.memberCount >= 2 && (
              <div className="mt-2.5 flex items-center gap-1.5">
                {Array.from({ length: Math.min(data.memberCount, 12) }).map((_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: decorative dots have no identity beyond their position
                    key={i}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      i < data.threshold ? "bg-accent" : "bg-border-strong",
                    )}
                  />
                ))}
                {data.memberCount > 12 && (
                  <span className="text-[10px] tabular-nums text-ink-subtle">
                    +{data.memberCount - 12}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Divider — vertical on desktop, horizontal on mobile */}
          <div className="hidden w-px bg-border/60 md:block" aria-hidden="true" />
          <div className="h-px bg-border/60 md:hidden" aria-hidden="true" />

          {/* CLOAK PRIVACY side — opposite corner */}
          <div className="flex-1 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-eyebrow text-ink-subtle">Cloak Privacy</p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  data.cofreInitialized
                    ? "bg-accent/10 text-accent"
                    : "bg-surface-2 text-ink-subtle",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    data.cofreInitialized ? "animate-pulse bg-accent" : "bg-ink-subtle/60",
                  )}
                />
                {data.cofreInitialized ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="mt-2 flex items-start gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                  data.cofreInitialized
                    ? "border-accent/25 bg-accent/[0.06] text-accent"
                    : "border-border bg-surface-2 text-ink-subtle",
                )}
              >
                <Shield className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {data.cofreInitialized ? "Shielded routing enabled" : "Privacy not initialized"}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {data.cofreInitialized
                    ? "Private sends route through the Cloak shield pool"
                    : "Initialize to unlock private payments"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending proposals — below the main grid */}
      <PendingProposalsCard multisig={multisig} proposals={proposals} />

      {/* Activity — full width */}
      <RecentActivityCard multisig={multisig} activity={activity} isLoading={activityLoading} />

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

"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { CofreInitBanner } from "@/components/vault/CofreInitBanner";
import { OverviewCard } from "@/components/vault/OverviewCard";
import { PendingProposalsCard } from "@/components/vault/PendingProposalsCard";
import { PrivacyFlowModal, PrivacyFlowTrigger } from "@/components/vault/PrivacyFlowModal";
import { ReceiveModal } from "@/components/vault/ReceiveModal";
import { RecentActivityCard } from "@/components/vault/RecentActivityCard";
import { SendModal } from "@/components/vault/SendModal";
import { SwapModal } from "@/components/vault/SwapModal";
import { useRecentActivity } from "@/lib/hooks/useRecentActivity";
import { truncateAddress } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { useVaultMetadata } from "@/lib/use-vault-metadata";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { useState } from "react";

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
        <button
          type="button"
          onClick={handleCopyAddress}
          className="flex h-5 w-5 items-center justify-center rounded text-ink-subtle opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover/address:opacity-100"
          aria-label="Copy vault address"
          title={copiedAddress ? "Copied" : multisig}
        >
          {copiedAddress ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
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
  const [privacyFlowOpen, setPrivacyFlowOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="h-12 w-48 shimmer-bg rounded-lg" />
        {/* Balance skeleton */}
        <div className="h-40 shimmer-bg rounded-2xl" />
        {/* Quick actions skeleton */}
        <div className="grid grid-cols-3 gap-3">
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
        usdcUi={data.usdcUi}
        cofreInitialized={data.cofreInitialized}
        onRefresh={refresh}
        onReceive={() => setReceiveOpen(true)}
        onSend={() => setSendOpen(true)}
        onSwap={() => setSwapOpen(true)}
      />

      {/* Governance + Cloak block */}
      <div className="rounded-2xl border border-border/60 bg-surface transition-colors duration-200 hover:border-accent/15">
        {/* Threshold row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle">Governance</p>
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
              {data.threshold}/{data.memberCount}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">Required signatures</p>
          </div>

          <div className="h-10 w-px bg-border/60" />

          {/* Approval dots */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle">Members</p>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.min(data.memberCount, 8) }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${i < data.threshold ? "bg-accent" : "bg-border-strong"}`}
                />
              ))}
              {data.memberCount > 8 && (
                <span className="text-[10px] text-ink-subtle">+{data.memberCount - 8}</span>
              )}
              <span className="ml-1 text-xs text-ink-muted">{data.memberCount}</span>
            </div>
          </div>
        </div>

        {/* Cloak row — separado, com identidade própria */}
        <div className="flex items-center justify-between border-t border-border/50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-md ${
                data.cofreInitialized ? "bg-accent/10" : "bg-surface-2"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  data.cofreInitialized ? "bg-accent animate-pulse" : "bg-ink-subtle/50"
                }`}
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink">
                Cloak — Privacy Layer
              </p>
              <p className="text-[10px] text-ink-subtle">
                {data.cofreInitialized ? "Shielded transactions enabled" : "Not initialized — set up to enable private sends"}
              </p>
            </div>
          </div>
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              data.cofreInitialized
                ? "bg-accent/10 text-accent"
                : "bg-surface-2 text-ink-subtle"
            }`}
          >
            {data.cofreInitialized ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Privacy flow explainer */}
      <PrivacyFlowTrigger onClick={() => setPrivacyFlowOpen(true)} />

      {/* Pending proposals — below the main grid */}
      <PendingProposalsCard multisig={multisig} proposals={proposals} />

      {/* Activity — full width */}
      <RecentActivityCard multisig={multisig} activity={activity} isLoading={activityLoading} />

      <PrivacyFlowModal open={privacyFlowOpen} onOpenChange={setPrivacyFlowOpen} />

      <ReceiveModal multisig={multisig} open={receiveOpen} onOpenChange={setReceiveOpen} />
      <SendModal multisig={multisig} open={sendOpen} onOpenChange={setSendOpen} />
      <SwapModal multisig={multisig} open={swapOpen} onOpenChange={setSwapOpen} />
    </div>
  );
}

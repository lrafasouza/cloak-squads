"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
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
import { AlertTriangle, BookOpen, Check, Copy, Lock, Shield, Users, Zap } from "lucide-react";
import Link from "next/link";
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
        usdcUi={data.usdcUi}
        cofreInitialized={data.cofreInitialized}
        onRefresh={refresh}
        onReceive={() => setReceiveOpen(true)}
        onSend={() => setSendOpen(true)}
        onSwap={() => setSwapOpen(true)}
      />

      {/* Secondary actions */}
      <div className="flex items-center gap-3">
        <Link
          href={`/vault/${multisig}/invoice`}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface px-4 py-3 text-sm font-medium text-ink transition-all hover:border-accent/15 hover:text-accent"
        >
          <BookOpen className="h-4 w-4" strokeWidth={1.5} />
          Invoice
        </Link>
        <Link
          href={`/vault/${multisig}/payroll`}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface px-4 py-3 text-sm font-medium text-accent transition-all hover:border-accent/20 hover:bg-accent/[0.03]"
        >
          <Zap className="h-4 w-4" strokeWidth={1.5} />
          Payroll
        </Link>
      </div>

      {/* Privacy flow explainer */}
      <PrivacyFlowTrigger onClick={() => setPrivacyFlowOpen(true)} />

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          icon={Lock}
          sub={data.cofreInitialized ? "Protected" : "Pending"}
        />
      </div>

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

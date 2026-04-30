"use client";

import { AddressPill } from "@/components/ui/address-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { AlertTriangle, Clock, Loader2, Shield, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { use, useMemo } from "react";

function MemberRow({
  address,
  index,
}: {
  address: string;
  index: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
          {index + 1}
        </div>
        <div>
          <AddressPill value={address} chars={8} />
          <p className="text-xs text-ink-subtle">Member</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
          Eligible signer
        </span>
      </div>
    </div>
  );
}

export default function MembersPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { data, isLoading, error } = useVaultData(multisig);
  const { data: proposals = [] } = useProposalSummaries(multisig);

  const pendingMemberProposals = useMemo(
    () =>
      proposals.filter(
        (p) =>
          p.status === "active" &&
          (p.memo?.toLowerCase().includes("member") || p.memo?.toLowerCase().includes("threshold")),
      ),
    [proposals],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-ink-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading members…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load members"
          description="Check the vault address and network connection."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Members</h1>
          <p className="text-xs text-ink-muted">
            {data.memberCount} members · {data.threshold}/{data.memberCount} threshold
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover disabled:opacity-50"
          disabled
          title="Requires Squads config proposal (coming soon)"
        >
          <UserPlus className="h-4 w-4" />
          Add Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={data.memberCount} icon={Users} />
        <StatCard
          label="Threshold"
          value={`${data.threshold}/${data.memberCount}`}
          icon={Shield}
          sub={`${Math.round((data.threshold / data.memberCount) * 100)}% required`}
        />
        <StatCard
          label="Pending Changes"
          value={pendingMemberProposals.length}
          icon={Shield}
          sub={pendingMemberProposals.length > 0 ? "Awaiting approval" : "None"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {pendingMemberProposals.length > 0 ? (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                <Clock className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink">Pending member change</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Sign or execute member and threshold proposals from the proposal queue.
                </p>
              </div>
            </div>
            <Link
              href={`/vault/${multisig}/proposals`}
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Open proposals
            </Link>
          </div>
        </div>
      ) : null}

      {/* Members list */}
      <div className="flex flex-col gap-2">
        {data.members.map((addr, i) => (
          <MemberRow key={addr} address={addr} index={i} />
        ))}
      </div>

      <p className="text-xs text-ink-subtle">
        This vault requires any {data.threshold} of {data.memberCount} eligible member
        {data.threshold === 1 ? "" : "s"} to approve a proposal before it can execute. Votes are
        submitted from the proposal detail page, not from the member list.
      </p>
    </div>
  );
}

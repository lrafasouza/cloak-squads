"use client";

import type { ActivityItem } from "@/lib/hooks/useRecentActivity";
import { publicEnv } from "@/lib/env";
import { type ProposalSummary, truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowRightLeft, ArrowUpRight, Send, Users } from "lucide-react";
import Link from "next/link";

const CLUSTER_SUFFIX =
  publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "" : "?cluster=devnet";

const PROPOSAL_STATUS = {
  executed: { dot: "bg-signal-success", label: "Executed", cls: "text-signal-success" },
  rejected: { dot: "bg-signal-danger", label: "Rejected", cls: "text-signal-danger" },
  cancelled: { dot: "bg-ink-subtle", label: "Cancelled", cls: "text-ink-subtle" },
} as const;

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ProposalRow({ multisig, p }: { multisig: string; p: ProposalSummary }) {
  const statusKey = p.status as keyof typeof PROPOSAL_STATUS;
  const status = PROPOSAL_STATUS[statusKey] ?? {
    dot: "bg-ink-subtle",
    label: p.status ?? "—",
    cls: "text-ink-subtle",
  };

  const amountSol =
    p.type === "payroll"
      ? p.totalAmount && p.totalAmount !== "0"
        ? lamportsToSol(p.totalAmount)
        : null
      : p.amount && p.amount !== "0"
        ? lamportsToSol(p.amount)
        : null;

  const typeLabel = p.type === "payroll" ? "Payroll" : p.type === "single" ? "Transfer" : "Config";
  const detail =
    p.type === "payroll"
      ? `${p.recipientCount ?? "?"} recipients`
      : p.recipient && p.recipient !== "Squads vault transaction"
        ? truncateAddress(p.recipient)
        : p.title || p.memo || "—";

  const time =
    p.createdAt && new Date(p.createdAt).getFullYear() > 1970
      ? relativeTime(new Date(p.createdAt).getTime())
      : null;

  const TypeIcon = p.type === "payroll" ? Users : p.type === "single" ? Send : ArrowRightLeft;

  return (
    <Link
      href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-subtle transition-colors group-hover:bg-accent/10 group-hover:text-accent">
        <TypeIcon className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            {typeLabel}
          </span>
          <span className="font-mono text-[10px] text-ink-subtle">#{p.transactionIndex}</span>
        </div>
        <p className="truncate text-sm font-medium text-ink">{detail}</p>
        {p.memo && p.type !== "single" && (
          <p className="truncate text-xs text-ink-subtle">{p.memo}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {amountSol ? (
          <span className="font-mono text-sm font-semibold tabular-nums text-ink">
            -{amountSol} <span className="text-xs font-normal text-ink-subtle">SOL</span>
          </span>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        )}
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
          <span className={cn("text-[10px] font-medium", status.cls)}>{status.label}</span>
          {time && <span className="text-[10px] text-ink-subtle">· {time}</span>}
        </div>
      </div>

      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function IncomeRow({
  signature,
  amountLamports,
  from,
  blockTime,
}: {
  signature: string;
  amountLamports: number;
  from: string;
  blockTime: number;
}) {
  const amountSol = lamportsToSol(String(amountLamports));
  const time = relativeTime(blockTime * 1000);
  const explorerUrl = `https://solscan.io/tx/${signature}${CLUSTER_SUFFIX}`;

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-signal-positive/10 text-signal-positive transition-colors">
        <ArrowDownToLine className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
          Received
        </span>
        <p className="truncate font-mono text-sm font-medium text-ink">
          {from === "Unknown" ? "Unknown sender" : truncateAddress(from)}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-sm font-semibold tabular-nums text-signal-success">
          +{amountSol} <span className="text-xs font-normal text-ink-subtle">SOL</span>
        </span>
        <span className="text-[10px] text-ink-subtle">{time}</span>
      </div>

      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

export function RecentActivityCard({
  multisig,
  activity,
  isLoading = false,
}: {
  multisig: string;
  activity: ActivityItem[];
  isLoading?: boolean;
}) {
  if (!isLoading && activity.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-surface transition-all duration-300 hover:border-accent/10">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-5">
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle">
            Recent Activity
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            {isLoading ? "Loading…" : `${activity.length} transactions`}
          </p>
        </div>
        <Link
          href={`/vault/${multisig}/proposals`}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="p-2">
        {isLoading && activity.length === 0 ? (
          <div className="space-y-2 px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 shrink-0 rounded-md shimmer-bg" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 shimmer-bg rounded" />
                <div className="h-3 w-40 shimmer-bg rounded" />
              </div>
              <div className="h-3 w-16 shimmer-bg rounded" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 shrink-0 rounded-md shimmer-bg" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 shimmer-bg rounded" />
                <div className="h-3 w-32 shimmer-bg rounded" />
              </div>
              <div className="h-3 w-16 shimmer-bg rounded" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 shrink-0 rounded-md shimmer-bg" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-20 shimmer-bg rounded" />
                <div className="h-3 w-36 shimmer-bg rounded" />
              </div>
              <div className="h-3 w-16 shimmer-bg rounded" />
            </div>
          </div>
        ) : (
          activity.map((item) =>
            item.kind === "proposal" ? (
              <ProposalRow key={item.data.id} multisig={multisig} p={item.data} />
            ) : (
              <IncomeRow
                key={item.signature}
                signature={item.signature}
                amountLamports={item.amountLamports}
                from={item.from}
                blockTime={item.blockTime}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

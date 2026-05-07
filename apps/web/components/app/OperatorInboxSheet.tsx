"use client";

import { TtlPill } from "@/components/ui/aegis";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { generateIdenticon } from "@/lib/identicon";
import { truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { cn } from "@/lib/utils";
import { ArrowRight, Inbox, Key, Lock, Trash2, Users, X } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

interface OperatorInboxSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  multisig: string;
  items: OperatorInboxItem[];
  loading: boolean;
  onDismiss?: (id: string) => void;
  onClearAll?: () => void;
}

export type OperatorInboxItem = {
  id: string;
  transactionIndex: string;
  amount: string;
  recipient: string;
  type: "single" | "payroll";
  recipientCount?: number;
  expiresAt?: Date;
  status: "pending" | "executed" | "expired";
};

const STATUS_TONE: Record<OperatorInboxItem["status"], { dot: string; label: string }> = {
  pending: { dot: "bg-signal-warn", label: "Awaiting key" },
  executed: { dot: "bg-signal-positive", label: "Executed" },
  expired: { dot: "bg-signal-danger", label: "Expired" },
};

export function OperatorInboxSheet({
  open,
  onOpenChange,
  multisig,
  items,
  loading,
  onDismiss,
  onClearAll,
}: OperatorInboxSheetProps) {
  const pendingCount = useMemo(
    () => items.filter((i) => i.status === "pending").length,
    [items],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col overflow-hidden p-0">
        {/* Heraldic gold seal — preview of the Sprint D modal pattern */}
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-0 h-[3px] bg-gradient-to-r from-accent/0 via-accent to-accent/0"
        />

        <SheetHeader className="px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                <Key className="h-4 w-4 text-accent" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-eyebrow">Operator</p>
                <SheetTitle className="mt-0.5 truncate">Inbox</SheetTitle>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {pendingCount > 0 && (
                <span
                  className="flex h-6 min-w-[28px] items-center justify-center rounded-full bg-accent px-2 text-[11px] font-bold tabular-nums text-accent-ink"
                  aria-label={`${pendingCount} awaiting`}
                >
                  {pendingCount}
                </span>
              )}
              {items.length > 0 && onClearAll && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-signal-danger"
                  title="Clear all items from inbox"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>
          <SheetDescription className="mt-2">
            Pending licenses awaiting execution by the registered operator. Executing relays the
            shielded payload through Cloak.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
              <p className="mt-4 text-sm text-ink-muted">Loading pending licenses…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-2 shadow-raise-1">
                <Inbox className="h-7 w-7 text-ink-subtle" />
              </div>
              <h3 className="mt-5 text-sm font-semibold text-ink">No pending licenses</h3>
              <p className="mt-1.5 max-w-[260px] text-sm leading-relaxed text-ink-muted">
                Once a proposal is approved and executed by the vault, you will see licenses here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <OperatorInboxRow
                  key={item.id}
                  item={item}
                  multisig={multisig}
                  {...(onDismiss ? { onDismiss } : {})}
                  onClose={() => onOpenChange(false)}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OperatorInboxRow({
  item,
  multisig,
  onDismiss,
  onClose,
}: {
  item: OperatorInboxItem;
  multisig: string;
  onDismiss?: (id: string) => void;
  onClose: () => void;
}) {
  const tone = STATUS_TONE[item.status];
  const isPayroll = item.type === "payroll";

  // Identicon seed: payrolls aren't tied to one address, fall back to the
  // transaction index so the row still has a stable visual anchor.
  const identiconSeed = isPayroll ? `payroll-${item.transactionIndex}` : item.recipient;
  const identicon = useMemo(() => generateIdenticon(identiconSeed, 28), [identiconSeed]);

  const recipientLabel = isPayroll
    ? `${item.recipientCount ?? 0} recipients`
    : truncateAddress(item.recipient);

  const typeLabel = isPayroll ? "Payroll · License" : "Private transfer · License";

  return (
    <li className="card-panel group relative">
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md text-ink-subtle opacity-0 transition-aegis hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex flex-col gap-3 p-4">
        {/* Top row — identicon + type/recipient + status pill */}
        <div className="flex items-start justify-between gap-3 pr-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={identicon}
                alt=""
                aria-hidden="true"
                width={28}
                height={28}
                className="h-7 w-7 rounded-md ring-1 ring-border"
              />
              {isPayroll && (
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-surface text-ink-subtle">
                  <Users className="h-2 w-2" strokeWidth={2.25} />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-eyebrow truncate">{typeLabel}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-ink num">{recipientLabel}</p>
            </div>
          </div>

          {/* Status — quiet dot + label, no border-pill noise */}
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              {tone.label}
            </span>
          </div>
        </div>

        {/* Bottom row — amount (Fraunces) + execute CTA */}
        <div className="flex items-end justify-between gap-3 border-t border-border/50 pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-eyebrow text-ink-subtle/70">Amount</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink">
              {lamportsToSol(item.amount)}{" "}
              <span className="text-sm font-medium text-ink-subtle">SOL</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {item.expiresAt ? <TtlPill expiresAt={item.expiresAt} /> : null}
            {item.status === "pending" ? (
              <Link
                href={`/vault/${multisig}/operator?proposal=${encodeURIComponent(item.transactionIndex)}`}
                onClick={onClose}
                className={cn(
                  "group/cta inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-xs font-semibold transition-aegis",
                  "bg-gradient-to-r from-accent to-accent-hover text-accent-ink shadow-raise-1 hover:shadow-accent-glow",
                )}
              >
                <Lock className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
                Execute
                <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
              </Link>
            ) : (
              <Link
                href={`/vault/${multisig}/operator?proposal=${encodeURIComponent(item.transactionIndex)}`}
                onClick={onClose}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-3.5 text-xs font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
              >
                View
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

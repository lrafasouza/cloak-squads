"use client";

import { Divider, StatusBadge, TtlPill } from "@/components/ui/aegis";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { lamportsToSol } from "@/lib/sol";
import { ArrowRight, Inbox, Key, User, Users } from "lucide-react";
import Link from "next/link";

interface OperatorInboxSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  multisig: string;
  items: OperatorInboxItem[];
  loading: boolean;
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

export function OperatorInboxSheet({
  open,
  onOpenChange,
  multisig,
  items,
  loading,
}: OperatorInboxSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col" autoClose={false}>
        <SheetHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2">
                <Key className="h-4 w-4 text-ink-subtle" />
              </div>
              <SheetTitle>Operator Inbox</SheetTitle>
            </div>
            {items.length > 0 && (
              <span className="flex h-5 items-center justify-center rounded-full bg-accent px-2 text-[11px] font-bold text-accent-ink">
                {items.length}
              </span>
            )}
          </div>
          <SheetDescription>
            Pending licenses awaiting execution by the registered operator.
          </SheetDescription>
        </SheetHeader>

        <Divider />

        <div className="flex-1 overflow-y-auto pt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
              <p className="mt-4 text-sm text-ink-muted">Loading pending licenses...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-2 shadow-raise-1">
                <Inbox className="h-7 w-7 text-ink-subtle" />
              </div>
              <h3 className="mt-5 text-sm font-semibold text-ink">No pending licenses</h3>
              <p className="mt-1 max-w-[260px] text-sm leading-relaxed text-ink-muted">
                Once a proposal is approved and executed by the vault, you will see licenses here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-raise-1 transition-all duration-200 hover:border-border-strong hover:shadow-raise-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                        {item.type === "payroll" ? (
                          <Users className="h-3.5 w-3.5 text-ink-subtle" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-ink-subtle" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-ink">
                          {item.type === "payroll"
                            ? `Payroll · ${item.recipientCount ?? 0} recipients`
                            : "Single Transfer"}
                        </span>
                        <span className="mt-0.5 font-mono text-xs text-ink-subtle num">
                          {item.recipient}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={item.status} />
                      {item.expiresAt ? <TtlPill expiresAt={item.expiresAt} /> : null}
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between gap-3">
                    <div className="font-display text-xl font-semibold tracking-tight text-ink num">
                      {lamportsToSol(item.amount)} <span className="text-sm font-medium text-ink-subtle">SOL</span>
                    </div>
                    <Link
                      href={`/vault/${multisig}/operator?proposal=${encodeURIComponent(item.transactionIndex)}`}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink shadow-raise-1 transition-all duration-200 hover:bg-accent-hover hover:shadow-raise-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                      Execute
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

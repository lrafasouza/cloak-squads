"use client";

import { Divider, Eyebrow, StatusBadge, TtlPill } from "@/components/ui/aegis";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { lamportsToSol } from "@/lib/sol";
import { Key } from "lucide-react";
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
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Operator Inbox</SheetTitle>
          <SheetDescription>
            Pending licenses awaiting execution by the registered operator.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
              <p className="mt-4 text-sm text-ink-muted">Loading pending licenses...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
                <Key className="h-6 w-6 text-ink-subtle" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-ink">No pending licenses</h3>
              <p className="mt-1 max-w-[240px] text-sm text-ink-muted">
                Once a proposal is approved and executed by the vault, you will see licenses here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Eyebrow>License</Eyebrow>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.expiresAt ? <TtlPill expiresAt={item.expiresAt} /> : null}
                  </div>
                  <div className="mt-3 font-mono text-sm text-ink num">
                    {item.type === "payroll"
                      ? `${item.recipientCount ?? 0} recipients · ${lamportsToSol(item.amount)} SOL`
                      : `${lamportsToSol(item.amount)} SOL`}
                  </div>
                  <div className="mt-1 font-mono text-xs text-ink-subtle num">{item.recipient}</div>
                  <Divider className="my-3" />
                  <Link
                    href={`/vault/${multisig}/operator?proposal=${encodeURIComponent(item.transactionIndex)}`}
                    onClick={() => onOpenChange(false)}
                    className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-xs font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    Execute
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

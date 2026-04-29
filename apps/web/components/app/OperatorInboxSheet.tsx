"use client";

import { Divider, Eyebrow, StatusBadge, TtlPill } from "@/components/ui/aegis";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Key } from "lucide-react";

interface OperatorInboxSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function OperatorInboxSheet({ open, onOpenChange }: OperatorInboxSheetProps) {
  const items: Array<{
    id: string;
    amount: string;
    recipient: string;
    expiresAt: Date;
    status: "pending" | "executed" | "expired";
  }> = []; // TODO: wire to pending licenses query

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
          {items.length === 0 ? (
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
                    <TtlPill expiresAt={item.expiresAt} />
                  </div>
                  <div className="mt-3 font-mono text-sm text-ink num">{item.amount}</div>
                  <div className="mt-1 font-mono text-xs text-ink-subtle num">
                    {item.recipient}
                  </div>
                  <Divider className="my-3" />
                  <Button variant="default" size="sm" className="w-full">
                    Execute
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

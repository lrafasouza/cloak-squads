"use client";

import { ReceiveModal } from "@/components/vault/ReceiveModal";
import { SendModal } from "@/components/vault/SendModal";
import { SwapModal } from "@/components/vault/SwapModal";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, BookOpen, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const actions = [
  {
    id: "receive",
    label: "Receive",
    description: "Deposit funds",
    icon: ArrowDownToLine,
    variant: "default" as const,
  },
  {
    id: "send",
    label: "Send",
    description: "Transfer out",
    icon: ArrowUpFromLine,
    variant: "default" as const,
  },
  {
    id: "swap",
    label: "Swap",
    description: "Swap tokens",
    icon: ArrowLeftRight,
    variant: "default" as const,
  },
  {
    id: "invoice",
    label: "Invoice",
    description: "Request payment",
    icon: BookOpen,
    variant: "default" as const,
  },
  {
    id: "payroll",
    label: "Payroll",
    description: "Batch payments",
    icon: Zap,
    variant: "accent" as const,
  },
];

interface QuickActionBarProps {
  multisig: string;
}

export function QuickActionBar({ multisig }: QuickActionBarProps) {
  const base = `/vault/${multisig}`;
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          const isAccent = action.variant === "accent";

          const inner = (
            <>
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  isAccent
                    ? "bg-accent/10 text-accent"
                    : "bg-surface-2 text-ink-subtle group-hover:bg-accent/10 group-hover:text-accent",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div className="mt-3">
                <p className={cn("text-sm font-semibold", isAccent ? "text-accent" : "text-ink")}>
                  {action.label}
                </p>
                <p className="text-[11px] text-ink-subtle">{action.description}</p>
              </div>
            </>
          );

          const cardClass = cn(
            "group flex w-full flex-col items-start rounded-2xl border p-4 text-left transition-all duration-300",
            isAccent
              ? "border-accent/20 bg-accent/[0.03] hover:border-accent/40 hover:shadow-accent-glow"
              : "border-border/60 bg-surface hover:border-accent/15 hover:shadow-raise-1",
          );

          if (action.id === "receive") {
            return (
              <button key={action.id} type="button" onClick={() => setReceiveOpen(true)} className={cardClass}>
                {inner}
              </button>
            );
          }
          if (action.id === "send") {
            return (
              <button key={action.id} type="button" onClick={() => setSendOpen(true)} className={cardClass}>
                {inner}
              </button>
            );
          }
          if (action.id === "swap") {
            return (
              <button key={action.id} type="button" onClick={() => setSwapOpen(true)} className={cardClass}>
                {inner}
              </button>
            );
          }
          return (
            <Link key={action.id} href={`${base}/${action.id}`} className={cardClass}>
              {inner}
            </Link>
          );
        })}
      </div>

      <ReceiveModal multisig={multisig} open={receiveOpen} onOpenChange={setReceiveOpen} />
      <SendModal multisig={multisig} open={sendOpen} onOpenChange={setSendOpen} />
      <SwapModal multisig={multisig} open={swapOpen} onOpenChange={setSwapOpen} />
    </>
  );
}

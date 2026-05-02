"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  sub?: string;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, sub, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "group rounded-xl border border-border/60 bg-surface p-5 transition-all duration-300 hover:border-accent/15 hover:bg-surface-2/50 hover:shadow-raise-1",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle">
            {label}
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight text-accent">
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
        </div>
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-subtle transition-colors group-hover:bg-accent/10 group-hover:text-accent">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}

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
        "rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-ink-subtle">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
        </div>
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2">
            <Icon className="h-4 w-4 text-ink-subtle" />
          </div>
        )}
      </div>
    </div>
  );
}

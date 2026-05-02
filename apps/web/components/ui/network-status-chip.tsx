"use client";

import { useRpcHealth } from "@/lib/hooks/useRpcHealth";
import { cn } from "@/lib/utils";

export function NetworkStatusChip({ className }: { className?: string }) {
  const { data, isError, isPending } = useRpcHealth();

  const status: "green" | "yellow" | "red" = isError
    ? "red"
    : isPending
      ? "yellow"
      : (data?.latencyMs ?? 0) > 2000
        ? "red"
        : (data?.latencyMs ?? 0) > 500
          ? "yellow"
          : "green";

  const label =
    status === "red" ? "Degraded" : status === "yellow" ? "Slow" : "Network";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "green" && "bg-signal-positive",
          status === "yellow" && "bg-signal-warn",
          status === "red" && "bg-signal-danger animate-pulse",
        )}
      />
      {label}
      {data?.latencyMs != null && (
        <span className="tabular-nums text-ink-subtle">{data.latencyMs}ms</span>
      )}
    </div>
  );
}

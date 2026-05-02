"use client";

import { cn } from "@/lib/utils";

interface SignatureProgressProps {
  approvals: number;
  threshold: number;
  className?: string;
  showDots?: boolean;
}

export function SignatureProgress({
  approvals,
  threshold,
  className,
  showDots = true,
}: SignatureProgressProps) {
  const pct = Math.min(100, (approvals / Math.max(1, threshold)) * 100);
  const complete = approvals >= threshold;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showDots && (
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(threshold, 8) }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i < approvals ? "bg-accent" : "bg-border-strong",
              )}
            />
          ))}
        </div>
      )}
      {!showDots && (
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              complete ? "bg-signal-positive" : "bg-accent",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <span
        className={cn(
          "text-xs tabular-nums font-medium",
          complete ? "text-signal-positive" : "text-ink-muted",
        )}
      >
        {approvals}/{threshold}
      </span>
    </div>
  );
}

"use client";

import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AutoCloseIndicatorProps {
  durationMs: number;
  onComplete: () => void;
  className?: string;
  paused?: boolean;
  onRemainingChange?: (remaining: number) => void;
}

export function AutoCloseIndicator({
  durationMs,
  onComplete,
  className,
  paused = false,
  onRemainingChange,
}: AutoCloseIndicatorProps) {
  const totalSeconds = Math.ceil(durationMs / 1000);
  const [remaining, setRemaining] = useState(totalSeconds);

  useEffect(() => {
    setRemaining(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    if (paused || remaining <= 0) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        onRemainingChange?.(next);
        if (next <= 0) {
          clearInterval(interval);
        }
        return next;
      });
    }, 1000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      onComplete();
    }, durationMs);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [durationMs, onComplete, paused, remaining, onRemainingChange]);

  if (remaining <= 0) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-ink-muted",
        className,
      )}
      title={`Auto-closing in ${remaining}s`}
    >
      <Timer className="h-3.5 w-3.5 animate-pulse" />
      <span className="font-mono tabular-nums">{remaining}s</span>
    </div>
  );
}

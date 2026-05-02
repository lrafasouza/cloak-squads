"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface StepperProps {
  steps: string[];
  current: number;
  className?: string;
}

export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <nav aria-label="Progress" className={cn("flex items-center gap-2", className)}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-2.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done
                    ? "bg-accent text-accent-ink"
                    : active
                      ? "bg-accent/15 text-accent"
                      : "bg-surface-2 text-ink-subtle",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <span>{i + 1}</span>}
              </div>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:block",
                  active ? "text-ink" : done ? "text-accent" : "text-ink-subtle",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-5 mb-5 h-[2px] w-16 flex-1 transition-colors sm:w-28",
                  i < current ? "bg-accent/50" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

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
    <nav aria-label="Progress" className={cn("flex items-center gap-0", className)}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  done
                    ? "border-accent bg-accent text-accent-ink"
                    : active
                      ? "border-accent text-accent"
                      : "border-border text-ink-subtle",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
              </div>
              <span
                className={cn(
                  "hidden text-[11px] font-medium sm:block",
                  active ? "text-ink" : done ? "text-accent" : "text-ink-subtle",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-5 h-px w-12 flex-1 transition-colors sm:w-16",
                  i < current ? "bg-accent/60" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

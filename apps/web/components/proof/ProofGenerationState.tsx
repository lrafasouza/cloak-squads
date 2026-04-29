"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export type ProofStepId = "load-circuits" | "generate-witness" | "prove";

const STEPS: Array<{ id: ProofStepId; label: string }> = [
  { id: "load-circuits", label: "Load circuits" },
  { id: "generate-witness", label: "Generate witness" },
  { id: "prove", label: "Prove" },
];

export function ProofGenerationState({
  currentStep,
  complete = false,
  error,
}: {
  currentStep: ProofStepId | null;
  complete?: boolean;
  error?: string | null;
}) {
  const activeIndex = currentStep ? STEPS.findIndex((step) => step.id === currentStep) : -1;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-ink">Proof generation</h2>
        <span
          className={cn("text-xs font-medium", complete ? "text-accent" : "text-ink-muted")}
        >
          {complete ? "Ready" : error ? "Failed" : currentStep ? "Running" : "Idle"}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {STEPS.map((step, index) => {
          const done = complete || index < activeIndex;
          const active = index === activeIndex && !complete && !error;
          return (
            <div key={step.id} className="flex items-center gap-3">
              <motion.div
                animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 1, repeat: active ? Number.POSITIVE_INFINITY : 0 }}
                className={cn(
                  "h-3 w-3 rounded-full border",
                  done && "border-emerald-300 bg-emerald-300",
                  active && "border-emerald-300 bg-bg",
                  !done && !active && "border-border-strong bg-surface",
                )}
              />
              <span
                className={cn("text-sm", done || active ? "text-ink" : "text-ink-subtle")}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {error ? <p className="mt-4 text-sm text-signal-danger">{error}</p> : null}
    </div>
  );
}

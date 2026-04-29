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
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-neutral-50">Proof generation</h2>
        <span
          className={cn("text-xs font-medium", complete ? "text-emerald-300" : "text-neutral-400")}
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
                  active && "border-emerald-300 bg-neutral-950",
                  !done && !active && "border-neutral-700 bg-neutral-900",
                )}
              />
              <span
                className={cn("text-sm", done || active ? "text-neutral-100" : "text-neutral-500")}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

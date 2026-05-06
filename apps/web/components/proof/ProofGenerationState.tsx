"use client";

import type { ProofStepId } from "@/lib/cloak-progress";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Lock, Shield, Sparkles } from "lucide-react";

export type { ProofStepId };

const STEPS: Array<{ id: ProofStepId; label: string; icon: typeof Lock }> = [
  { id: "load-circuits", label: "Preparing secure envelope", icon: Shield },
  { id: "generate-witness", label: "Sealing transaction details", icon: Lock },
  { id: "prove", label: "Finalizing privacy shield", icon: Sparkles },
];

export function ProofGenerationState({
  currentStep,
  complete = false,
  error,
  proofProgress,
}: {
  currentStep: ProofStepId | null;
  complete?: boolean;
  error?: string | null;
  proofProgress?: number;
}) {
  const activeIndex = currentStep ? STEPS.findIndex((step) => step.id === currentStep) : -1;

  const visible = currentStep !== null || complete || !!error;
  if (!visible) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <AnimatePresence mode="wait">
          {error ? (
            <motion.div
              key="error"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-signal-danger/30 bg-signal-danger/10"
            >
              <Shield className="h-5 w-5 text-signal-danger" />
            </motion.div>
          ) : complete ? (
            <motion.div
              key="complete"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-accent-soft"
            >
              <Check className="h-5 w-5 text-accent" />
            </motion.div>
          ) : (
            <motion.div
              key="active"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-accent-soft"
            >
              {/* CSS animation — continues on the compositor thread even while JS is blocked by the ZK proof */}
              <Shield className="h-5 w-5 text-accent animate-spin" />
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <h2 className="text-sm font-semibold text-ink">
            {error
              ? "Could not secure transaction"
              : complete
                ? "Secured and ready"
                : "Securing your transaction"}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {error
              ? "Please try again"
              : complete
                ? "Privacy shield active"
                : "This keeps recipient and amount hidden on-chain"}
          </p>
        </div>

        <div className="flex w-full items-center justify-center gap-2">
          {STEPS.map((step, index) => {
            const done = complete || index < activeIndex;
            const active = index === activeIndex && !complete && !error;
            const StepIcon = step.icon;

            return (
              <div key={step.id} className="flex items-center gap-2">
                {/* CSS pulse on the active step — runs on the compositor thread, never freezes */}
                <div
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-colors",
                    done && "border-accent/25 bg-accent-soft/50 opacity-100",
                    active && "border-accent/40 bg-accent-soft opacity-100 animate-pulse",
                    !done && !active && "border-border bg-surface-2 opacity-35",
                  )}
                >
                  <StepIcon
                    className={cn(
                      "h-3.5 w-3.5",
                      done && "text-accent",
                      active && "text-accent",
                      !done && !active && "text-ink-subtle",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[11px] font-medium leading-none",
                      done && "text-accent",
                      active && "text-ink",
                      !done && !active && "text-ink-subtle",
                    )}
                  >
                    Step {index + 1}
                  </span>
                </div>

                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "h-px w-4 transition-colors",
                      done ? "bg-accent/40" : "bg-border",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {currentStep === "prove" && typeof proofProgress === "number" && !complete && !error ? (
          <div className="w-full">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>Zero-knowledge proof</span>
              <span className="font-mono tabular-nums">{proofProgress}%</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
              {/* CSS transition — width update fires in the brief windows when snarkjs yields */}
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${proofProgress}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? <p className="text-xs text-signal-danger">{error}</p> : null}
      </div>
    </div>
  );
}

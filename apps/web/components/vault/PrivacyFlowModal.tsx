"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { FilePlus, Fingerprint, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

const steps = [
  {
    id: "create",
    title: "Create Privacy Proposal",
    description:
      "Start a private transaction (Send, Invoice, or Payroll) from the Primary vault. Amount and recipient are encrypted; only a commitment lands on-chain.",
    icon: FilePlus,
  },
  {
    id: "vote",
    title: "Vault Approves and Executes",
    description:
      "Members review and approve through Squads. Once the threshold is reached, any member executes the vault transaction.",
    icon: UsersRound,
  },
  {
    id: "operator",
    title: "Operator Signs the License",
    description:
      "The designated Operator opens the Operator inbox and signs the Cloak license. Without this final step, the private transfer never settles.",
    icon: Fingerprint,
  },
];

export function PrivacyFlowModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setActiveStep(0);
      return;
    }
    const timers = steps.map((_, i) =>
      window.setTimeout(() => setActiveStep(i + 1), 600 + i * 1100),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" watermark watermarkSize={320} className="p-6 sm:p-8">
        <span className="text-eyebrow text-ink-subtle">How it works</span>
        <h2 className="mt-1.5 font-display text-2xl leading-tight text-ink sm:text-[26px]">
          Privacy Flow
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">
          Every private transaction follows this exact three-step lifecycle. Skip any step and the
          transfer never settles.
        </p>

        <div className="relative mt-7 flex flex-col gap-1">
          <div
            className="absolute left-[27px] top-10 bottom-10 w-px bg-border"
            aria-hidden="true"
          />

          {steps.map((step, index) => {
            const Icon = step.icon;
            const isPast = activeStep > index + 1;
            const isCurrent = activeStep === index + 1;
            const isReached = isPast || isCurrent;

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.08, duration: 0.25 }}
                className="relative z-10 flex gap-4 py-3"
              >
                <div className="relative flex shrink-0 flex-col items-center">
                  {isCurrent ? (
                    <motion.div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10"
                      animate={{
                        boxShadow: [
                          "0 0 0px 0px hsl(39 49% 60% / 0)",
                          "0 0 24px 4px hsl(39 49% 60% / 0.28)",
                          "0 0 0px 0px hsl(39 49% 60% / 0)",
                        ],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "easeInOut",
                      }}
                    >
                      <Icon className="h-6 w-6 text-accent" />
                    </motion.div>
                  ) : (
                    <div
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors duration-500",
                        isReached ? "border-accent/40 bg-accent/10" : "border-border bg-surface-2",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-6 w-6 transition-colors duration-500",
                          isReached ? "text-accent" : "text-ink-subtle",
                        )}
                      />
                    </div>
                  )}

                  <div
                    className={cn(
                      "mt-2 flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-bold leading-none tabular-nums transition-colors",
                      isReached ? "bg-accent/15 text-accent" : "bg-surface-2 text-ink-subtle",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </div>
                </div>

                <div className="flex-1 pt-2">
                  <h3
                    className={cn(
                      "text-base font-semibold transition-colors duration-500",
                      isReached ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {step.title}
                  </h3>
                  <p
                    className={cn(
                      "mt-1.5 text-sm leading-relaxed transition-colors duration-500",
                      isReached ? "text-ink-muted" : "text-ink-subtle/60",
                    )}
                  >
                    {step.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-accent/20 bg-accent-soft/30 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
              <Fingerprint className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-accent">Don't forget the Operator</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                After the vault executes, the Operator must open the Operator page and sign the
                Cloak license. Until that signature lands, funds stay parked and the transfer is not
                finalized.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs text-ink-subtle">
            All privacy actions follow this exact lifecycle
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

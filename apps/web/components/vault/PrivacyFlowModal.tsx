"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Fingerprint, FilePlus, HelpCircle, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";

const steps = [
  {
    id: "create",
    title: "Create Privacy Proposal",
    description:
      "Start a private transaction: Send, Invoice, or Payroll. The details are shielded and committed on-chain.",
    icon: FilePlus,
    color: "#C9A86A",
  },
  {
    id: "vote",
    title: "Vote and Execute Vault",
    description:
      "Vault members review and approve the proposal through Squads. Once the threshold is reached, any member can execute the vault transaction.",
    icon: UsersRound,
    color: "#7FB069",
  },
  {
    id: "operator",
    title: "Operator Signs License",
    description:
      "The designated Operator receives the encrypted payload and cryptographically signs the Cloak license to complete the private transfer.",
    icon: Fingerprint,
    color: "#D4A24C",
  },
];

const operatorWarning = {
  title: "Do not forget the Operator",
  body: "After the vault executes the proposal, the Operator must open the Operator page and sign the Cloak license. Without this final step, the private transfer never completes.",
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 28,
      delayChildren: 0.15,
      staggerChildren: 0.12,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 12,
    transition: { duration: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 24 } },
};

function ParticleField() {
  const [particles] = useState(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1.5 + Math.random() * 2.5,
      duration: 4 + Math.random() * 6,
      delay: Math.random() * 4,
    })),
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `hsl(39 49% 60% / ${0.15 + Math.random() * 0.25})`,
          }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.8, 1],
            y: [0, -12, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function PrivacyFlowModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (open) {
      const timers = steps.map((_, i) =>
        window.setTimeout(() => setActiveStep(i + 1), 900 + i * 1400),
      );
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    setActiveStep(0);
  }, [open]);

  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-modal flex items-center justify-center p-4"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={() => onOpenChange(false)}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-bg/80 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className={cn(
              "relative z-10 h-screen w-screen overflow-y-auto border border-accent/20 bg-surface shadow-raise-2",
            )}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <ParticleField />

            {/* Header glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative flex h-full flex-col items-center justify-center">
              <div className="w-full max-w-2xl px-8 py-8">
                {/* Close */}
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-surface-2 text-ink-subtle transition-colors hover:border-accent/30 hover:text-accent"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Title */}
                <motion.div className="pt-6" variants={itemVariants}>
                  <span className="text-xs font-semibold uppercase tracking-eyebrow text-ink-subtle">
                    How it works
                  </span>
                  <h2 className="mt-2 font-display text-3xl leading-tight text-ink">
                    Privacy Flow
                  </h2>
                  <p className="mt-2 max-w-lg text-base leading-relaxed text-ink-muted">
                    Every private transaction (Send, Invoice, or Payroll) follows this exact three-step lifecycle.
                  </p>
                </motion.div>

                {/* Steps */}
                <div className="mt-10">
                  <div className="relative flex flex-col gap-2">
                    {/* Vertical connector line */}
                    <div className="absolute left-[27px] top-10 bottom-10 w-px bg-border" />

                    {steps.map((step, index) => {
                      const Icon = step.icon;
                      const isActive = activeStep > index;
                      const isCurrent = activeStep === index + 1;

                      return (
                        <motion.div
                          key={step.id}
                          className="relative z-10 flex gap-5 py-4"
                          variants={itemVariants}
                        >
                          {/* Icon node */}
                          <div className="relative flex shrink-0 flex-col items-center">
                            {isCurrent ? (
                              <motion.div
                                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 shadow-[0_0_24px_-4px_hsl(var(--accent)/0.4)]"
                                animate={{
                                  boxShadow: [
                                    "0 0 0px 0px hsl(39 49% 60% / 0)",
                                    "0 0 32px 6px hsl(39 49% 60% / 0.3)",
                                    "0 0 0px 0px hsl(39 49% 60% / 0)",
                                  ],
                                }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                              >
                                <Icon className="h-6 w-6 text-accent" />
                              </motion.div>
                            ) : (
                              <div
                                className={cn(
                                  "flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors duration-500",
                                  isActive
                                    ? "border-accent/40 bg-accent/10"
                                    : "border-border bg-surface-2",
                                )}
                              >
                                <Icon
                                  className={cn(
                                    "h-6 w-6 transition-colors duration-500",
                                    isActive ? "text-accent" : "text-ink-subtle",
                                  )}
                                />
                              </div>
                            )}

                            {/* Step number badge */}
                            <div
                              className={cn(
                                "mt-2 flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-bold leading-none transition-colors",
                                isActive || isCurrent
                                  ? "bg-accent/15 text-accent"
                                  : "bg-surface-2 text-ink-subtle",
                              )}
                            >
                              {String(index + 1).padStart(2, "0")}
                            </div>
                          </div>

                          {/* Content */}
                          <div className="flex-1 pt-2">
                            <motion.h3
                              className={cn(
                                "text-base font-semibold transition-colors duration-500",
                                isActive || isCurrent ? "text-ink" : "text-ink-muted",
                              )}
                            >
                              {step.title}
                            </motion.h3>
                            <motion.p
                              className={cn(
                                "mt-1.5 text-sm leading-relaxed transition-colors duration-500",
                                isActive || isCurrent ? "text-ink-muted" : "text-ink-subtle/60",
                              )}
                            >
                              {step.description}
                            </motion.p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Operator warning callout */}
                <motion.div
                  className="mt-8 rounded-2xl border border-accent/20 bg-accent-soft/30 p-5"
                  variants={itemVariants}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
                      <Fingerprint className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-accent">
                        {operatorWarning.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                        {operatorWarning.body}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Footer */}
                <motion.div className="mt-8 flex items-center gap-2" variants={itemVariants}>
                  <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs text-ink-subtle">
                    All privacy actions follow this exact lifecycle
                  </span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PrivacyFlowTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-surface p-4 text-left",
        "transition-all duration-300 hover:border-accent/25 hover:bg-accent/[0.03] hover:shadow-raise-1",
      )}
    >
      {/* Mini step icons */}
      <div className="flex shrink-0 items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
          <FilePlus className="h-3.5 w-3.5" />
        </div>
        <div className="h-px w-3 bg-accent/30" />
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
          <UsersRound className="h-3.5 w-3.5" />
        </div>
        <div className="h-px w-3 bg-accent/30" />
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
          <Fingerprint className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          Privacy requires 3 steps
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Create, Vote, then Operator signs. Click to learn the full flow.
        </p>
      </div>

      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-subtle transition-colors group-hover:bg-accent/10 group-hover:text-accent">
        <HelpCircle className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

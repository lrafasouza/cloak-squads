"use client";

import { Logo } from "@/components/brand/Logo";
import { Stepper } from "@/components/ui/stepper";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

const STEPS = ["Vault Details", "Members & Threshold", "Review & Confirm"];

interface WizardLayoutProps {
  step: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
}

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] },
  }),
};

export function WizardLayout({ step, title, subtitle, children, className }: WizardLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Top bar — minimal */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-5 backdrop-blur-xl">
        <Logo href="/" variant="monogram" size="sm" />
        <div className="flex items-center gap-3">
          <ClientWalletButton />
        </div>
      </header>

      {/* Stepper */}
      <div className="flex justify-center border-b border-border bg-surface/50 py-5">
        <Stepper steps={STEPS} current={step} />
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-10">
        <AnimatePresence mode="wait" custom={1}>
          <motion.div
            key={step}
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className={cn("flex flex-col", className)}
          >
            {/* Page heading */}
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-semibold text-ink">{title}</h1>
              <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
            </div>

            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

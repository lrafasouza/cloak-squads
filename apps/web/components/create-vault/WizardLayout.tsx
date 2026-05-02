"use client";

import { Logo } from "@/components/brand/Logo";
import { Stepper } from "@/components/ui/stepper";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
    <div className="relative flex min-h-screen flex-col bg-bg">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-30" />
      </div>

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/70 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Logo href="/" variant="monogram" size="sm" />
          <Link
            href="/vault"
            className="ml-2 hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink sm:inline-flex"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to vault
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <ClientWalletButton />
        </div>
      </header>

      {/* Stepper */}
      <div className="relative z-10 flex justify-center py-8 md:py-10">
        <Stepper steps={STEPS} current={step} />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-20 md:px-6">
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
            <div className="mb-10 text-center">
              <h1 className="font-display text-display font-semibold text-ink">{title}</h1>
              <p className="mt-2 text-base text-ink-muted">{subtitle}</p>
            </div>

            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

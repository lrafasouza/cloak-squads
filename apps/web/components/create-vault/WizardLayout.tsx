"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { Logo } from "@/components/brand/Logo";
import { Stepper } from "@/components/ui/stepper";
import { WalletMenu } from "@/components/wallet/WalletMenu";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const STEPS = ["Identity", "Council", "Forge"];
const ROMAN = ["I", "II", "III"];

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
    transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
  }),
};

export function WizardLayout({ step, title, subtitle, children, className }: WizardLayoutProps) {
  const eyebrowRoman = ROMAN[step] ?? "I";

  return (
    <div className="relative flex min-h-screen flex-col bg-bg">
      {/* Background — radial fade + faint grid + page-level heraldic watermark */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-25" />
        <HeraldicWatermark size={520} opacity={0.025} className="-right-24 -top-24 bottom-auto" />
      </div>

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/70 bg-bg/75 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Logo href="/" variant="monogram" size="sm" />
          <Link
            href="/vault"
            className="ml-2 hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink sm:inline-flex"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to vault
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <WalletMenu />
        </div>
      </header>

      {/* Hero header — eyebrow + serif title + stepper */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 pt-10 md:px-6 md:pt-14">
        <div className="text-center">
          <p className="text-eyebrow">
            Forge a vault
            <span className="mx-2 text-ink-subtle/40">·</span>
            <span className="text-accent">{eyebrowRoman}</span>
            <span className="mx-1.5 text-ink-subtle/40">of</span>
            <span className="text-ink-muted">III</span>
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted md:text-base">{subtitle}</p>
        </div>

        {/* Stepper */}
        <div className="mt-7 flex justify-center">
          <Stepper steps={STEPS} current={step} />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-20 pt-8 md:px-6 md:pt-12">
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
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

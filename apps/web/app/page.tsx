"use client";

import { BentoUseCases } from "@/components/landing/BentoUseCases";
import { CobeGlobe } from "@/components/landing/CobeGlobe";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { SecurityTrust } from "@/components/landing/SecurityTrust";
import { SeeItWork } from "@/components/landing/SeeItWork";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Eyebrow } from "@/components/ui/aegis";
import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   HERO — kept intentionally untouched
   ═══════════════════════════════════════════════════════════════════════════ */

function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section id="hero" ref={ref} className="relative z-10 overflow-hidden">
      <motion.div style={{ y, opacity }}>
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-6 md:px-6 md:pt-28 md:pb-16">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mb-4 md:mb-6 flex items-center justify-center"
          >
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 sm:px-4">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-warn opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-warn" />
              </span>
              <span className="whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.08em] text-accent sm:text-[11px] sm:tracking-eyebrow">
                <span className="sm:hidden">Squads · Cloak · Devnet</span>
                <span className="hidden sm:inline">Built on Squads · Powered by Cloak · Devnet</span>
              </span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <h1 className="font-display text-[2rem] leading-[1.08] tracking-tight sm:text-display font-bold text-ink">
              Privacy Infrastructure{" "}
              <span className="text-accent">for Every Solana Treasury</span>
            </h1>
            <p className="mt-2 text-sm font-medium text-ink-subtle">
              Built on Squads · Powered by Cloak
            </p>
          </motion.div>

          {/* Subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg md:text-xl">
              Aegis turns approval-gated multisig payments into cryptographically
              unlinkable, auditable transfers, without changing how your team already votes.
            </p>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center"
          >
            <Link
              href="/vault"
              className="inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-ink transition-all duration-200 hover:bg-accent-hover hover:shadow-accent-glow-md active:scale-[0.97] shadow-raise-1"
            >
              Open Vault
            </Link>
            <a
              href="https://docs.aegisz.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-border-strong bg-transparent px-5 py-3.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              View docs
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-4 text-center text-sm text-ink-subtle"
          >
            Free to use on <span className="text-accent">Solana Devnet</span>.
          </motion.p>

          {/* Globe */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 md:mt-12"
          >
            <CobeGlobe />
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePage() {
  return (
    <LenisProvider>
      <div className="relative min-h-screen bg-bg text-ink">
        {/* Animated background layers */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-radial-fade" />
          <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-[0.15]" />
          <motion.div
            className="absolute top-[10%] left-[15%] h-64 w-64 rounded-full opacity-[0.03] blur-[100px] hidden md:block"
            style={{ background: "hsl(var(--accent))" }}
            animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-[20%] right-[10%] h-96 w-96 rounded-full opacity-[0.02] blur-[120px] hidden md:block"
            style={{ background: "hsl(var(--accent))" }}
            animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
            transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <SiteHeader showWallet={false} />

        <HeroSection />

        {/* See it work — animated 5-act demo, ending on the bearer moat */}
        <SeeItWork />

        {/* Use cases — Bearer first (Aegis exclusive), then payroll, then audit */}
        <BentoUseCases />

        {/* Security & trust — clean, presence-led */}
        <SecurityTrust />

        {/* Comparison — kept (it works), now follows security */}
        <ComparisonSection />

        {/* FAQ */}
        <section id="faq" className="relative z-10 border-t border-border">
          <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
            <ScrollReveal>
              <div className="mb-12 max-w-xl mx-auto text-center">
                <Eyebrow as="div" className="mb-3">FAQ</Eyebrow>
                <h2 className="font-display text-display-sm font-bold text-ink">
                  Common questions
                </h2>
              </div>
            </ScrollReveal>
            <FAQ />
          </div>
        </section>

        <FinalCTASection />

        <SiteFooter />
      </div>
    </LenisProvider>
  );
}

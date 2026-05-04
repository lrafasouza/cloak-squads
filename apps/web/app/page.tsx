"use client";

import { CobeGlobe } from "@/components/landing/CobeGlobe";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { MarqueeTrustBar } from "@/components/landing/MarqueeTrustBar";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Eyebrow } from "@/components/ui/aegis";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Eye,
  FileText,
  Fingerprint,
  Layers,
  Lock,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   SECTIONS — Editorial layout, asymmetric, no AI-card patterns
   ═══════════════════════════════════════════════════════════════════════════ */

function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "Propose",
      desc: "Create a private payment inside your Squads vault. Choose the amount and a secret recipient address.",
      icon: Send,
    },
    {
      num: "02",
      title: "Approve",
      desc: "Your team reviews and votes on the payment, just like any other Squads proposal.",
      icon: ShieldCheck,
    },
    {
      num: "03",
      title: "Send",
      desc: "Aegis executes the payment privately. Amounts and addresses stay hidden from public view.",
      icon: Zap,
    },
  ];

  return (
    <section id="how" className="relative z-10">
      <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
        <ScrollReveal>
          <div className="mb-16 md:mb-20 text-center">
            <Eyebrow as="div" className="mb-3">How it works</Eyebrow>
            <h2 className="font-display text-display-sm font-bold text-ink max-w-xl mx-auto">
              Three steps to privacy
            </h2>
            <p className="mt-4 max-w-lg text-ink-muted mx-auto">
              Works with the Squads vault you already use. No new wallets, no new workflows.
            </p>
          </div>
        </ScrollReveal>

        {/* Wizard steps — horizontal on desktop, card-list on mobile */}
        <div className="relative">
          {/* Connecting line — desktop only */}
          <div className="absolute top-12 left-[16%] right-[16%] h-px bg-border hidden md:block" />

          {/* Desktop: centered circles */}
          <div className="hidden md:grid grid-cols-3 gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <ScrollReveal key={step.num} delay={i * 0.12} distance={20}>
                  <div className="relative flex flex-col items-center text-center">
                    <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full border-2 border-border bg-bg shadow-sm mb-6">
                      <Icon className="h-10 w-10 text-accent" strokeWidth={1.5} />
                    </div>
                    <span className="text-xs font-mono uppercase tracking-wider text-accent mb-2">
                      Step {step.num}
                    </span>
                    <h3 className="text-lg font-semibold text-ink mb-2">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-ink-muted max-w-xs">{step.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>

          {/* Mobile: horizontal step cards */}
          <div className="md:hidden space-y-0">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <ScrollReveal key={step.num} delay={i * 0.1} distance={16}>
                  <div className="relative flex items-start gap-4 py-5">
                    {/* Left column: icon + vertical connector */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-accent/30 bg-accent/5 z-10">
                        <Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
                      </div>
                      {i < steps.length - 1 && (
                        <div className="w-px flex-1 bg-border/60 mt-2 min-h-[2rem]" />
                      )}
                    </div>
                    {/* Right: content */}
                    <div className="pb-4">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-accent">
                        Step {step.num}
                      </span>
                      <h3 className="mt-0.5 text-base font-semibold text-ink">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.desc}</p>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function UseCasesSection() {
  const cases = [
    {
      icon: Eye,
      title: "Private Sends",
      desc: "Hide how much you send and who receives it. Only your team can see the details.",
      stat: "Fully shielded",
    },
    {
      icon: Users,
      title: "Payroll Batches",
      desc: "Pay your whole team in one Squads vote. Upload a spreadsheet, preview, and execute.",
      tag: "New",
      stat: "Bulk payments",
    },
    {
      icon: FileText,
      title: "Private Invoicing",
      desc: "Send invoices with secret claim links. Recipients withdraw without exposing their wallet.",
      stat: "End-to-end",
    },
    {
      icon: Shield,
      title: "Audit Links",
      desc: "Share read-only transaction views with accountants or regulators. Revoke anytime.",
      stat: "Scoped access",
    },
    {
      icon: RefreshCw,
      title: "Operator Role",
      desc: "Let a dedicated wallet execute payments after your team approves them. Keys stay separate.",
      stat: "Segregated",
    },
    {
      icon: Fingerprint,
      title: "Verify Before Signing",
      desc: "See exactly what you are approving before you sign. No blind transactions.",
      stat: "Transparent",
    },
  ];

  return (
    <section id="usecases" className="relative z-10 border-y border-border bg-surface/20">
      <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
        <ScrollReveal>
          <div className="mb-16 md:mb-24 max-w-xl mx-auto text-center">
            <Eyebrow as="div" className="mb-3">Use cases</Eyebrow>
            <h2 className="font-display text-display-sm font-bold text-ink">
              Built for privacy-first teams
            </h2>
            <p className="mt-4 text-ink-muted">
              Teams that demand both confidentiality and accountability.
            </p>
          </div>
        </ScrollReveal>

        <div className="divide-y divide-border/60">
          {cases.map((item, i) => {
            const Icon = item.icon;
            return (
              <ScrollReveal key={item.title} delay={i * 0.06} distance={16}>
                <div className="group py-8 md:py-10 flex flex-col md:flex-row md:items-start gap-5 md:gap-10">
                  <div className="flex items-center gap-4 md:w-64 shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft/50 group-hover:bg-accent-soft transition-colors duration-300">
                      <Icon className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                      {item.tag && (
                        <span className="text-[10px] uppercase tracking-wider font-medium text-accent">
                          {item.tag}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-ink-muted md:pt-1.5">
                    {item.desc}
                  </p>
                  <div className="shrink-0 md:w-32 md:text-right">
                    <span className="inline-block text-xs font-mono text-accent/70 border border-accent/20 rounded px-2 py-1">
                      {item.stat}
                    </span>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section id="security" className="relative z-10 border-y border-border bg-bg">
      <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
        <ScrollReveal>
          <div className="mb-16 md:mb-20 max-w-xl mx-auto text-center">
            <Eyebrow as="div" className="mb-3">Security</Eyebrow>
            <h2 className="font-display text-display-sm font-bold text-ink">How Aegis protects you</h2>
            <p className="mt-4 text-ink-muted">
              Three layers working together. You control every step.
            </p>
          </div>
        </ScrollReveal>

        {/* Desktop horizontal pipeline */}
        <div className="hidden md:flex items-stretch gap-0 max-w-4xl mx-auto">
          <ScrollReveal delay={0} className="flex-1">
            <div className="relative h-full p-6 border border-border bg-surface/40 rounded-l-lg border-r-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface border border-border">
                  <Users className="h-5 w-5 text-ink" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Squads</p>
                  <p className="text-xs text-ink-subtle">Your team approves</p>
                </div>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Every payment starts as a normal Squads proposal. Your existing members vote with the same thresholds you already trust.
              </p>
            </div>
          </ScrollReveal>

          <div className="flex items-center -mx-3 z-10">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent border-2 border-bg">
              <ArrowRight className="h-4 w-4 text-accent-ink" />
            </div>
          </div>

          <ScrollReveal delay={0.1} className="flex-1">
            <div className="relative h-full p-6 border border-accent/30 bg-accent/5">
              <div className="absolute top-3 right-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded">On-chain</span>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft border border-accent/20">
                  <Layers className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Cloak Engine</p>
                  <p className="text-xs text-accent">Privacy layer</p>
                </div>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Our on-chain engine issues one-time permissions for each approved payment. Every permission expires automatically.
              </p>
            </div>
          </ScrollReveal>

          <div className="flex items-center -mx-3 z-10">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent border-2 border-bg">
              <ArrowRight className="h-4 w-4 text-accent-ink" />
            </div>
          </div>

          <ScrollReveal delay={0.2} className="flex-1">
            <div className="relative h-full p-6 border border-border bg-surface/40 rounded-r-lg border-l-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface border border-border">
                  <Zap className="h-5 w-5 text-ink" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Operator</p>
                  <p className="text-xs text-ink-subtle">Executes safely</p>
                </div>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                A dedicated wallet runs the payment using the one-time permission. It never touches your team&apos;s private keys.
              </p>
            </div>
          </ScrollReveal>
        </div>

        {/* Mobile stacked */}
        <div className="md:hidden space-y-4 max-w-md mx-auto">
          {[
            { icon: Users, title: "Squads", subtitle: "Your team approves", desc: "Every payment starts as a normal Squads proposal. Your existing members vote with the same thresholds you already trust." },
            { icon: Layers, title: "Cloak Engine", subtitle: "Privacy layer", desc: "Our on-chain engine issues one-time permissions for each approved payment. Every permission expires automatically." },
            { icon: Zap, title: "Operator", subtitle: "Executes safely", desc: "A dedicated wallet runs the payment using the one-time permission. It never touches your team\u2019s private keys." },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <ScrollReveal key={item.title} delay={i * 0.1}>
                <div className="p-5 border border-border bg-surface/40 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border">
                      <Icon className="h-4 w-4 text-ink" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      <p className="text-xs text-ink-subtle">{item.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-sm text-ink-muted leading-relaxed">{item.desc}</p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>

        {/* Bottom trust points */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft/50">
              <Lock className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">One-time permissions</p>
              <p className="text-xs text-ink-muted mt-0.5">Auto-expire after use or timeout</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft/50">
              <Fingerprint className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">No key custody</p>
              <p className="text-xs text-ink-muted mt-0.5">We never store or touch private keys</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft/50">
              <Eye className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Scoped audit views</p>
              <p className="text-xs text-ink-muted mt-0.5">Share and revoke access anytime</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
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
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-warn opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-warn" />
              </span>
              <span className="text-eyebrow text-accent">Devnet Live</span>
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
              Private Execution for{" "}
              <span className="text-accent">Shared Treasuries</span>
            </h1>
          </motion.div>

          {/* Subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg md:text-xl">
              Private multisig payments on Solana. Send and receive without exposing amounts
              or recipient addresses on public block explorers.
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
              href="https://docs.aegis.cloak.dev"
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

export default function HomePage() {
  return (
    <LenisProvider>
      <div className="relative min-h-screen bg-bg text-ink">
        {/* Animated background layers */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-radial-fade" />
          <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-[0.15]" />
          {/* Ambient floating orbs — desktop only */}
          <motion.div
            className="absolute top-[10%] left-[15%] h-64 w-64 rounded-full opacity-[0.03] blur-[100px] hidden md:block"
            style={{ background: "hsl(var(--accent))" }}
            animate={{
              x: [0, 40, 0],
              y: [0, -30, 0],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-[20%] right-[10%] h-96 w-96 rounded-full opacity-[0.02] blur-[120px] hidden md:block"
            style={{ background: "hsl(var(--accent))" }}
            animate={{
              x: [0, -50, 0],
              y: [0, 40, 0],
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <SiteHeader showWallet={false} />

        <HeroSection />

        <MarqueeTrustBar />

        <HowItWorksSection />

        <UseCasesSection />

        <ComparisonSection />

        <SecuritySection />

        {/* ═══════════ FAQ ═══════════ */}
        <section id="faq" className="relative z-10 border-t border-border">
          <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
            <ScrollReveal>
              <div className="mb-12 max-w-xl mx-auto text-center">
                <Eyebrow as="div" className="mb-3">FAQ</Eyebrow>
                <h2 className="font-display text-display-sm font-bold text-ink">Common questions</h2>
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

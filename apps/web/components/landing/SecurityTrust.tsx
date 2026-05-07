"use client";

import { motion } from "framer-motion";
import { Eyebrow } from "../ui/aegis";
import { ScrollReveal } from "./ScrollReveal";

/* ─────────────────────────────────────────────────────────────────────────
   SecurityTrust — clean, presence-led. No nested cards, no dense lists.
   Big type, plenty of air, four rows. Matches the cadence of FinalCTA.
   ───────────────────────────────────────────────────────────────────────── */

type Principle = {
  num: string;
  scenario: string;
  answer: string;
};

const PRINCIPLES: Principle[] = [
  {
    num: "01",
    scenario: "Operator compromise",
    answer: "Permissions are single-use, time-bound, and burned on execute.",
  },
  {
    num: "02",
    scenario: "Backend compromise",
    answer: "Privacy lives on Solana. The server is a stateless relay.",
  },
  {
    num: "03",
    scenario: "Bearer link leak",
    answer: "Default 24h expiry, single-claim, revokable before claim.",
  },
  {
    num: "04",
    scenario: "Auditor scope abuse",
    answer: "Read-only, Ed25519-signed, every view logged.",
  },
];

function PrincipleRow({ p, i }: { p: Principle; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="group relative grid grid-cols-[auto,1fr] md:grid-cols-[auto,1fr,1fr] items-baseline gap-x-6 gap-y-1 py-7 md:py-8 border-t border-border/50 last:border-b last:border-b-border/50"
    >
      <span className="font-mono text-[11px] uppercase tracking-eyebrow text-ink-subtle md:self-center">
        {p.num}
      </span>
      <h3 className="font-display text-xl md:text-2xl font-semibold text-ink leading-tight tracking-tight md:self-center">
        {p.scenario}
      </h3>
      <p className="col-start-2 md:col-start-3 text-sm md:text-base text-ink-muted leading-relaxed md:self-center md:max-w-md md:text-right md:ml-auto">
        {p.answer}
      </p>
    </motion.div>
  );
}

export function SecurityTrust() {
  return (
    <section
      id="security"
      className="relative z-10 border-y border-border/60 bg-bg overflow-hidden"
    >
      {/* Subtle backdrop — matches FinalCTA */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 0%, hsl(var(--accent) / 0.05), transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-40">
        {/* Header — asymmetric, like FinalCTA */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-end mb-16 md:mb-24">
          <ScrollReveal className="lg:col-span-7">
            <Eyebrow as="div" className="mb-5">
              Security
            </Eyebrow>
            <h2 className="font-display font-bold text-ink leading-[0.98] tracking-[-0.025em] text-[clamp(2.25rem,6vw,4.5rem)]">
              What an attacker
              <br />
              <span className="text-accent">can&apos;t do.</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.1} className="lg:col-span-5">
            <p className="text-base md:text-lg text-ink-muted leading-relaxed">
              A privacy product is only as strong as the threats it survives.
              Four scenarios, four answers, no marketing language, no
              hand-waving.
            </p>
          </ScrollReveal>
        </div>

        {/* Principles — typographic rail, no boxes */}
        <div>
          {PRINCIPLES.map((p, i) => (
            <PrincipleRow key={p.num} p={p} i={i} />
          ))}
        </div>

        {/* Footer rail — single line, calm */}
        <ScrollReveal delay={0.25}>
          <div className="mt-16 md:mt-24 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-[10px] uppercase tracking-eyebrow text-ink-subtle">
            <span>No custodial keys</span>
            <span className="text-ink-subtle/30">·</span>
            <span>Open-source program</span>
            <span className="text-ink-subtle/30">·</span>
            <span>
              Devnet · v0 →{" "}
              <span className="text-accent">External audit</span> → Mainnet
            </span>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

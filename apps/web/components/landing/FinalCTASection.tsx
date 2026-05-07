"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Eyebrow } from "../ui/aegis";

const PERKS = [
  "Free on Solana devnet",
  "No new wallet, no new chain",
  "Multisig from day one",
];

export function FinalCTASection() {
  return (
    <section className="relative z-10 overflow-hidden">
      {/* Top divider — gold accent cross-bar */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, hsl(var(--accent) / 0.55) 50%, transparent 100%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pt-28 pb-24 md:px-6 md:pt-40 md:pb-36">
        {/* Backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 50% 0%, hsl(var(--accent) / 0.08), transparent 60%)",
          }}
        />

        {/* Eyebrow centered up top */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center gap-3 mb-12 md:mb-20"
        >
          <span
            aria-hidden
            className="h-px w-10 bg-gradient-to-r from-transparent to-accent/50"
          />
          <Eyebrow as="div">Ready when you are</Eyebrow>
          <span
            aria-hidden
            className="h-px w-10 bg-gradient-to-l from-transparent to-accent/50"
          />
        </motion.div>

        {/* Asymmetric grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-end">
          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7"
          >
            <h2 className="font-display font-bold text-ink leading-[0.98] tracking-[-0.035em] text-[clamp(2.5rem,7vw,5.5rem)]">
              Your treasury,
              <br />
              <span className="relative inline-block">
                <span className="text-accent">finally yours alone.</span>
                <span
                  aria-hidden
                  className="absolute left-0 right-0 -bottom-1 h-[3px] rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, hsl(var(--accent) / 0.8), hsl(var(--accent) / 0))",
                  }}
                />
              </span>
            </h2>
          </motion.div>

          {/* Right column: copy + perks + CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 space-y-7"
          >
            <p className="text-base md:text-lg text-ink-muted leading-relaxed max-w-md">
              Connect a wallet and create your Aegis vault on Solana devnet.
              Squads multisig is built in. It takes about a minute.
            </p>

            {/* Perks */}
            <ul className="space-y-2.5">
              {PERKS.map((p, i) => (
                <motion.li
                  key={p}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.06, duration: 0.4 }}
                  className="flex items-center gap-2.5 text-sm text-ink-muted"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15">
                    <Check
                      className="h-2.5 w-2.5 text-accent"
                      strokeWidth={3}
                    />
                  </span>
                  {p}
                </motion.li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
              <Link
                href="/create"
                className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-ink shadow-raise-1 transition-all hover:bg-accent-hover hover:shadow-accent-glow-md active:scale-[0.98]"
              >
                <span>Create your vault</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="https://docs.aegisz.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Read the docs
                <ArrowRight className="h-3.5 w-3.5 opacity-60" />
              </a>
            </div>
          </motion.div>
        </div>

        {/* Bottom rail */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-20 md:mt-28 flex items-center gap-4"
        >
          <div className="h-px flex-1 bg-border/60" />
          <span className="font-mono text-[10px] uppercase tracking-eyebrow text-ink-subtle">
            Aegis · Solana devnet · v0
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </motion.div>
      </div>
    </section>
  );
}

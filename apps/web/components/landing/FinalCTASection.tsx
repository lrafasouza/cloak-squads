"use client";

import { motion } from "framer-motion";
import { ArrowRight, Shield } from "lucide-react";
import Link from "next/link";

export function FinalCTASection() {
  return (
    <section className="relative z-10 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-3xl border border-border/60 bg-surface p-8 text-center md:p-16"
        >
          {/* Subtle radial glow */}
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-radial-fade opacity-50" />

          <div className="relative">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
              <Shield className="h-6 w-6 text-accent" strokeWidth={1.5} />
            </div>

            <h2 className="font-display text-display-sm mx-auto max-w-2xl font-bold text-ink">
              Ready to shield your treasury?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-ink-muted">
              Connect your wallet and open an existing Squads vault, or create a new one with
              Aegis privacy built in.
            </p>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Link
                href="/vault"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-ink shadow-raise-1 transition-all hover:bg-accent-hover hover:shadow-accent-glow-md active:scale-[0.98]"
              >
                Open your vault
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://docs.aegis.cloak.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-strong bg-transparent px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
              >
                Read the docs
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

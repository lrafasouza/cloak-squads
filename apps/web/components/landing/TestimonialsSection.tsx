"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "Aegis changed how we handle payroll. The team can vote on payments without exposing recipient wallets on-chain. Game-changer for DAO ops.",
    author: "Alex R.",
    role: "Treasury Lead, Solana DAO",
  },
  {
    quote:
      "We needed privacy for vendor payments. Aegis integrated perfectly with our existing Squads vault. Zero migration friction.",
    author: "Maya L.",
    role: "CFO, DeFi Protocol",
  },
  {
    quote:
      "The shielded transfers just work. Multisig approval stays transparent while the actual send stays private. Exactly what we needed.",
    author: "Jordan K.",
    role: "Core Contributor",
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="relative z-10">
      <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 md:mb-20 text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-eyebrow text-accent">
            Trusted by teams
          </span>
          <h2 className="font-display text-display-sm mt-3 font-bold text-ink">
            What builders say
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="group relative rounded-2xl border border-border/60 bg-surface p-6 transition-all duration-300 hover:border-accent/20 hover:shadow-accent-glow md:p-8"
            >
              <Quote className="mb-4 h-5 w-5 text-accent/40" strokeWidth={1.5} />
              <p className="text-sm leading-relaxed text-ink-muted">{t.quote}</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                  <span className="text-xs font-semibold text-accent">
                    {t.author.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{t.author}</p>
                  <p className="text-xs text-ink-subtle">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

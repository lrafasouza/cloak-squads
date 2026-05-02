"use client";

import { motion } from "framer-motion";
import { Eye, Send, Shield, Wallet } from "lucide-react";

const stats = [
  { label: "Vaults created", value: "1,240+", icon: Wallet },
  { label: "SOL shielded", value: "48,200+", icon: Shield },
  { label: "Private sends", value: "8,500+", icon: Send },
  { label: "Active members", value: "3,600+", icon: Eye },
];

export function HeroStatsBar() {
  return (
    <section className="relative z-10 border-y border-border/40 bg-surface/[0.4] backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                  <Icon className="h-4 w-4 text-accent" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">
                    {stat.value}
                  </p>
                  <p className="text-xs text-ink-subtle">{stat.label}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

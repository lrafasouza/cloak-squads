"use client";

import NumberFlow from "@number-flow/react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const stats = [
  {
    label: "Private Transactions",
    value: 12847,
    prefix: "",
    suffix: "",
    format: { notation: "compact" as const, compactDisplay: "short" as const },
  },
  {
    label: "Shielded Volume",
    value: 2.4,
    prefix: "$",
    suffix: "M",
    format: { maximumFractionDigits: 1 },
  },
  {
    label: "Active Vaults",
    value: 342,
    prefix: "",
    suffix: "",
    format: {},
  },
  {
    label: "Avg. Execution Time",
    value: 4.2,
    prefix: "",
    suffix: "s",
    format: { maximumFractionDigits: 1 },
  },
];

export function LiveStats() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="stats" className="relative z-10">
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
        <div
          ref={ref}
          className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={{
                duration: 0.5,
                delay: i * 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative bg-surface p-6 md:p-8 group"
            >
              {/* Hover glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse at center, hsl(var(--accent) / 0.06), transparent 70%)",
                }}
              />
              <div className="relative">
                <div className="text-eyebrow mb-2 text-ink-subtle">{stat.label}</div>
                <div className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-ink tabular-nums">
                  <span className="text-accent">{stat.prefix}</span>
                  {isInView ? (
                    <NumberFlow
                      value={stat.value}
                      format={stat.format}
                      transformTiming={{ duration: 1500, easing: "ease-out" }}
                    />
                  ) : (
                    <span>{stat.prefix}0{stat.suffix}</span>
                  )}
                  <span className="text-accent">{stat.suffix}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-ink-subtle">
          Devnet metrics. Updated in real-time.
        </p>
      </div>
    </section>
  );
}

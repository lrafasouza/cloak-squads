"use client";

import { motion } from "framer-motion";
import { Shield, Zap } from "lucide-react";

/**
 * Animated protocol diagram: Squads → Gatekeeper → Operator
 * A golden "License" token travels from Gatekeeper to Operator in a loop.
 */
export function HeroDiagram() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-2xl">
      <div className="relative flex items-center justify-between gap-4 rounded-xl border border-border bg-surface/50 p-6 backdrop-blur-sm">
        {/* Node 1: Squads */}
        <Node label="Squads" sub="multisig">
          <Shield className="h-5 w-5 text-ink-muted" />
        </Node>

        {/* Connection 1→2 */}
        <div className="relative flex-1">
          <div className="h-px w-full bg-border" />
          <motion.div
            className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-ink-subtle"
            animate={{ left: ["0%", "100%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
          />
        </div>

        {/* Node 2: Gatekeeper */}
        <Node label="Gatekeeper" sub="license">
          <div className="flex h-5 w-5 items-center justify-center rounded-sm border border-accent/40 bg-accent-soft">
            <span className="text-[10px] font-bold text-accent">GK</span>
          </div>
        </Node>

        {/* Connection 2→3 */}
        <div className="relative flex-1">
          <div className="h-px w-full bg-border" />
          {/* Golden license token */}
          <motion.div
            className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-accent shadow-[0_0_12px_rgba(201,168,106,0.4)]"
            style={{ background: "hsl(var(--accent))" }}
            animate={{ left: ["0%", "100%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1, repeatDelay: 1 }}
          />
        </div>

        {/* Node 3: Operator */}
        <Node label="Operator" sub="execute">
          <Zap className="h-5 w-5 text-ink-muted" />
        </Node>
      </div>

      {/* Bottom labels */}
      <div className="mt-3 flex justify-between text-eyebrow text-ink-subtle">
        <span>Approve</span>
        <span>Issue license</span>
        <span>Execute</span>
      </div>
    </div>
  );
}

function Node({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface shadow-raise-1">
        {children}
      </div>
      <div className="text-center">
        <div className="text-xs font-semibold text-ink">{label}</div>
        <div className="text-[10px] uppercase tracking-wider text-ink-subtle">{sub}</div>
      </div>
    </div>
  );
}

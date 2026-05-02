"use client";

import { motion } from "framer-motion";
import {
  Landmark,
  Lock,
  Network,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

const items = [
  { icon: Shield, label: "Shielded Execution" },
  { icon: Lock, label: "Client-side Secrets" },
  { icon: Users, label: "Multi-sig Security" },
  { icon: ShieldCheck, label: "Auditable" },
  { icon: Zap, label: "Solana Native" },
  { icon: Network, label: "Squads Protocol" },
  { icon: Landmark, label: "Treasury-grade" },
  { icon: Sparkles, label: "Private Payroll" },
];

export function MarqueeTrustBar() {
  const all = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-border/40 bg-accent/[0.02]">
      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-bg to-transparent" />

      <div className="flex py-5">
        <motion.div
          className="flex shrink-0 items-center"
          animate={{ x: ["0%", "-50%"] }}
          transition={{
            duration: 40,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {all.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-10 text-sm whitespace-nowrap"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/10">
                  <Icon className="h-3 w-3 shrink-0 text-accent/70" strokeWidth={1.5} />
                </div>
                <span className="text-xs font-medium tracking-wide text-ink-subtle/60">
                  {item.label}
                </span>
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

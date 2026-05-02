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
    <div className="relative overflow-hidden border-y border-border/60">
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
                className="flex items-center gap-2 px-8 text-sm text-ink-subtle/30 whitespace-nowrap"
              >
                <Icon className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span className="text-xs font-medium tracking-wide">
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

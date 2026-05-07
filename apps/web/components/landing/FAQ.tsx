"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const faqs = [
  {
    q: "What is Aegis?",
    a: "Aegis is a treasury app on Solana, powered by Squads Protocol v4 as its multisig layer. When you create an Aegis vault, you get Squads-style approvals, members and thresholds, plus privacy primitives, payroll, invoicing and scoped audit on top.",
  },
  {
    q: "How is Aegis different from Arcium, Umbra, or Darklake?",
    a: "Those projects shield wallet-to-wallet payments. Aegis is the only one that wraps the full treasury surface (multisig approvals, payroll, bearer invoices, and scoped audit links) around that privacy layer. We're not the cipher; we're the product the cipher lives inside.",
  },
  {
    q: "Can I import my existing Squads vault?",
    a: "Not yet. Today you create a fresh Aegis vault that uses Squads multisig under the hood. Importing an existing Squads vault is on the roadmap, since it requires onboarding the existing multisig PDA into Aegis's operator + privacy config without disturbing your members or thresholds.",
  },
  {
    q: "How does the Operator work, and what if it's compromised?",
    a: "The Operator is a dedicated wallet you choose for your vault. After your team approves a payment through Squads, the Cloak Engine issues a one-time, time-bound permission scoped to that exact payment. The Operator can only execute what your team already approved, and it cannot create or approve new payments. If compromised, replace it with a normal Squads vote.",
  },
  {
    q: "Do permissions expire?",
    a: "Yes. Every permission is single-use and time-bound, 60 seconds by default. If it is not used within that window, it expires automatically. An intercepted permission is useless after the deadline, and is burned on first execute.",
  },
  {
    q: "What's a bearer invoice and when is it dangerous?",
    a: "A bearer invoice is a claim link you can publish or DM without knowing the recipient's wallet upfront, since they pick it at claim time. The trade-off: anyone with the link can claim, like bearer cash. We default expiry to 24h, mark them with a red badge, and let you revoke before claim. Use bound mode if you need the recipient locked in.",
  },
  {
    q: "Can transactions be audited?",
    a: "Yes. You generate time-limited, read-only links for accountants or regulators, scoped by date, member, or category. Exports are Ed25519-signed so they're verifiable offline and tamper-evident. Every view is logged. The public blockchain remains blind.",
  },
  {
    q: "Is this ready for mainnet?",
    a: "Aegis is live on Solana devnet for testing only. Mainnet ships after an external audit closes. Follow the project on GitHub for the public roadmap.",
  },
];

export function FAQ({ className }: { className?: string }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className={cn("mx-auto max-w-2xl", className)}>
      {faqs.map((faq, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className={cn(
              "border-b border-border",
              i === 0 && "border-t",
            )}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="group flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-ink"
            >
              <span className="text-sm font-semibold text-ink group-hover:text-accent transition-colors duration-200">{faq.q}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-ink-muted transition-transform duration-300",
                  isOpen && "rotate-180",
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="pb-5 text-sm leading-relaxed text-ink-muted">
                    {faq.a}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

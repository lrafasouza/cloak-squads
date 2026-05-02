"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const faqs = [
  {
    q: "What is Aegis?",
    a: "Aegis adds privacy to your existing Squads treasury on Solana. Your team approves payments the same way they always have. Aegis then executes those payments so amounts and recipient addresses stay hidden from public block explorers.",
  },
  {
    q: "How does the Operator work?",
    a: "The Operator is a dedicated wallet you choose for your vault. After your team approves a payment through Squads, the Cloak Engine on Solana issues a one-time permission. Only your Operator can use that permission to complete the private payment.",
  },
  {
    q: "Do permissions expire?",
    a: "Yes. Every permission is one-time and has a time limit. If it is not used within that window, it expires automatically. This means even if someone intercepted a permission, it would be useless after the deadline.",
  },
  {
    q: "Can transactions be audited?",
    a: "Yes. You can generate time-limited audit links for accountants or regulators. These links show only the transactions you choose to share, and you can revoke them at any time. The public blockchain remains blind.",
  },
  {
    q: "What happens if the Operator wallet is compromised?",
    a: "The Operator can only run payments your team already approved through Squads. It cannot create or approve new payments on its own. If needed, you can replace the Operator instantly through a normal Squads vote.",
  },
  {
    q: "Is this ready for mainnet?",
    a: "Aegis is live on Solana devnet for testing. Mainnet requires additional security review and production hardening. Follow the project on GitHub for the public roadmap.",
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

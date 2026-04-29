"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const faqs = [
  {
    q: "What is Aegis?",
    a: "Aegis is a private execution layer for Squads v4 multisig treasuries on Solana. It lets teams approve sensitive transfers through normal Squads flows, then executes them via Cloak zero-knowledge proofs — hiding amounts and counterparties from public explorers.",
  },
  {
    q: "How does the Operator work?",
    a: "The Operator is a designated wallet registered per vault. After Squads members approve a proposal and the vault executes a transaction, the Gatekeeper program issues a single-use, time-limited license. Only the registered Operator can consume this license to perform the private transfer.",
  },
  {
    q: "What is a license TTL?",
    a: "TTL (time-to-live) is the expiration window of an execution license. Licenses are single-use and expire after a configured duration. This limits the attack surface — even if a license is intercepted, it becomes useless after expiration.",
  },
  {
    q: "Can transactions be audited?",
    a: "Yes. Aegis supports scoped audit links with viewing keys. A vault member can generate a time-bound audit URL that exposes scoped transaction data to an authorized party without revealing anything to the public. Audit links can be revoked at any time.",
  },
  {
    q: "What happens if the Operator wallet is compromised?",
    a: "The Operator wallet can only consume licenses that have already been approved by the Squads vault threshold. It cannot create new licenses or bypass the multisig. If compromised, the vault can rotate the Operator through a new Squads proposal.",
  },
  {
    q: "Is this ready for mainnet?",
    a: "Currently Aegis runs on devnet for technical validation. Mainnet readiness requires additional security review, production infrastructure hardening, and end-to-end smoke testing. Follow the project on GitHub for mainnet timelines.",
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
              className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors"
            >
              <span className="text-sm font-semibold text-ink">{faq.q}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            </button>
            {isOpen && (
              <div className="pb-5 text-sm leading-relaxed text-ink-muted">
                {faq.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

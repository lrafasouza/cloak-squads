"use client";

import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

const cols = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how" },
      { label: "Use cases", href: "#usecases" },
      { label: "Security", href: "#security" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "https://docs.aegis.cloak.dev", external: true },
      { label: "GitHub", href: "https://github.com/cloak-dev/aegis", external: true },
      { label: "SDK guide", href: "https://docs.aegis.cloak.dev/sdk", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "https://github.com/cloak-dev/aegis", external: true },
      { label: "Brand", href: "https://github.com/cloak-dev/aegis", external: true },
    ],
  },
];

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-border bg-bg", className)}>
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Logo href="/" size="md" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
              Aegis extends Squads Protocol v4 with privacy, payroll, invoicing,
              and scoped audit. Built on top of the multisig standard $10B+ in
              Solana treasuries already trust.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal-warn animate-pulse" />
                <span className="text-eyebrow text-accent">Devnet Live</span>
              </div>
              <a
                href="https://squads.so"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                <ExternalLink className="h-3 w-3" />
                Built on Squads
              </a>
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="text-eyebrow mb-4">{col.title}</h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-ink-muted transition-colors hover:text-ink"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-ink-muted transition-colors hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-xs text-ink-subtle">
            &copy; {new Date().getFullYear()} Aegis. Private execution for shared treasuries.
          </p>
          <div className="flex gap-6 text-xs text-ink-subtle">
            <a
              href="https://github.com/cloak-dev/aegis"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink transition-colors"
            >
              Terms
            </a>
            <a
              href="https://github.com/cloak-dev/aegis"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink transition-colors"
            >
              Privacy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

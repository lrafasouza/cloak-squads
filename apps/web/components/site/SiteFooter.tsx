"use client";

import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
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
      { label: "About", href: "#" },
      { label: "Brand", href: "#" },
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
              Private execution for shared treasuries on Solana. Shielded multisig operations,
              auditable when required.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal-warn animate-pulse" />
              <span className="text-eyebrow text-accent">Devnet Live</span>
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
            <Link href="#" className="hover:text-ink transition-colors">
              Terms
            </Link>
            <Link href="#" className="hover:text-ink transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

"use client";

import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const nav = [
  { label: "How it works", href: "#how" },
  { label: "Use cases", href: "#usecases" },
  { label: "Docs", href: "#docs" },
  { label: "Security", href: "#security" },
];

export function SiteHeader({ className }: { className?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border/60 bg-bg/70 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Logo href="/" size="md" />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          <ClientWalletButton />
          <Link
            href="#create"
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover shadow-raise-1"
          >
            Open vault
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-bg/95 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col px-4 py-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <ClientWalletButton />
              <Link
                href="#create"
                className="inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover shadow-raise-1"
              >
                Open vault
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

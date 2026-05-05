"use client";

import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const nav = [
  { label: "How it works", href: "#how" },
  { label: "Use cases", href: "#usecases" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
];

export function SiteHeader({ className, showWallet = true, minimal = false }: { className?: string; showWallet?: boolean; minimal?: boolean }) {
  const pathname = usePathname();
  const isVaultPage = pathname?.startsWith("/vault");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={cn("relative sticky top-0 z-40 px-4 pt-3 md:px-6", className)}>
      {/* Glass shell navbar — Brand Deliverable §02 */}
      <header
        className={cn(
          "mx-auto flex max-w-[1100px] items-center justify-between gap-4",
          "rounded-[18px] border border-[#1f1f25]",
          "px-5 py-3.5 md:px-[22px] md:py-3.5",
          "bg-gradient-to-b from-[rgba(20,20,24,0.85)] to-[rgba(10,10,12,0.85)]",
          "backdrop-blur-[14px]",
          "shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]",
        )}
      >
        <Logo href="/" size="md" />

        {!minimal && (
          <>
            {/* Desktop nav */}
            <nav className="hidden items-center gap-[30px] md:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[13px] font-medium text-[#cfcfd6] transition-colors duration-200 hover:text-accent"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Desktop actions */}
            <div className="hidden items-center gap-3.5 md:flex">
              {/* Status pill — Brand Deliverable §02 */}
              {showWallet && <ClientWalletButton />}
              {!isVaultPage && (
                <Link
                  href="/vault"
                  className="inline-flex items-center justify-center rounded-full bg-accent px-[18px] py-2 text-[13px] font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent-hover"
                >
                  Open vault
                </Link>
              )}
            </div>
          </>
        )}
        {minimal && (
          <div className="flex items-center gap-3">
            {showWallet && <ClientWalletButton />}
          </div>
        )}

        {!minimal && (
          /* Mobile toggle */
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
      </header>

      {/* Mobile menu — absolute overlay so it floats over content */}
      {mobileOpen && !minimal && (
        <div className="absolute left-0 right-0 top-full z-50 mx-4 mt-2 rounded-[18px] border border-border bg-bg/95 backdrop-blur-xl md:hidden">
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
              {showWallet && <ClientWalletButton />}
              {!isVaultPage && (
                <Link
                  href="/vault"
                  className="inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
                >
                  Open vault
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

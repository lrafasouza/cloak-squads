"use client";

import { Logo } from "@/components/brand/Logo";
import { Address } from "@/components/ui/aegis";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FileText,
  Key,
  LayoutDashboard,
  List,
  Menu,
  Send,
  Settings,
  Shield,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import { OperatorInboxSheet } from "./OperatorInboxSheet";

const navItems = [
  { label: "Overview", href: "", icon: LayoutDashboard },
  { label: "Send", href: "/send", icon: Send },
  { label: "Payroll", href: "/payroll", icon: Users },
  { label: "Audit", href: "/audit", icon: Shield },
  { label: "Invoices", href: "/invoice", icon: FileText },
  { label: "Proposals", href: "/proposals", icon: List },
  { label: "Operator", href: "/operator", icon: Key },
  { label: "Settings", href: "#", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ multisig: string }>();
  const pathname = usePathname();
  const multisig = params?.multisig ?? "";
  const base = `/vault/${multisig}`;

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isActive = (href: string) => {
    if (!href) return pathname === base || pathname === `${base}/`;
    return pathname.startsWith(`${base}${href}`);
  };

  return (
    <div className="flex min-h-screen">
      {/* Desktop side nav */}
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-border bg-bg md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <Logo href="/" variant="monogram" size="sm" />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const href = item.href === "#" ? "#" : `${base}${item.href}`;
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent border-l-2 border-accent"
                    : "text-ink-muted hover:text-ink hover:bg-surface-2",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-ink-subtle")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-bg/80 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <span className="hidden text-eyebrow text-ink-subtle md:inline">Vault</span>
            {multisig && (
              <Address
                value={multisig}
                chars={6}
                className="text-sm"
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <OperatorInboxButton />
            {/* Wallet button placeholder — will be styled via globals.css override */}
            <div className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Wallet
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[260px] bg-bg border-r border-border shadow-raise-2">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Logo href="/" variant="monogram" size="sm" />
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 p-3">
              {navItems.map((item) => {
                const active = isActive(item.href);
                const href = item.href === "#" ? "#" : `${base}${item.href}`;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent-soft text-accent border-l-2 border-accent"
                        : "text-ink-muted hover:text-ink hover:bg-surface-2",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-ink-subtle")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ── Operator Inbox trigger (badge) ── */
function OperatorInboxButton() {
  const [open, setOpen] = useState(false);
  const count = 0; // TODO: wire to pending licenses query

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink hover:bg-surface-2"
      >
        <Key className="h-4 w-4" />
        <span className="hidden sm:inline">Inbox</span>
        {count > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-ink">
            {count}
          </span>
        )}
      </button>
      <OperatorInboxSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

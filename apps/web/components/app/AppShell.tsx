"use client";

import { VaultSelector } from "@/components/app/VaultSelector";
import { Logo } from "@/components/brand/Logo";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { WalletGuard } from "@/components/wallet/WalletGuard";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  FileText,
  HelpCircle,
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
import { useEffect, useMemo, useState } from "react";
import { type OperatorInboxItem, OperatorInboxSheet } from "./OperatorInboxSheet";

/* ── Nav structure ── */
interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "", icon: LayoutDashboard },
  { label: "Transactions", href: "/proposals", icon: List },
  { label: "Members", href: "/members", icon: Users },
];

const PRIVACY_NAV: NavItem[] = [
  { label: "Send Private", href: "/send", icon: Send },
  { label: "Payroll", href: "/payroll", icon: FileText },
  { label: "Operator", href: "/operator", icon: Key },
  { label: "Invoices", href: "/invoice", icon: BookOpen },
  { label: "Audit", href: "/audit", icon: Shield },
];

const BOTTOM_NAV: NavItem[] = [{ label: "Settings", href: "/settings", icon: Settings }];

/* ── Shared NavLink ── */
function NavLink({
  item,
  base,
  pathname,
  badge,
  onClick,
}: {
  item: NavItem;
  base: string;
  pathname: string;
  badge?: number;
  onClick?: () => void;
}) {
  const isActive =
    item.href === ""
      ? pathname === base || pathname === `${base}/`
      : pathname.startsWith(`${base}${item.href}`);

  const href = `${base}${item.href}`;
  const Icon = item.icon;

  return (
    <Link
      href={href}
      {...(onClick ? { onClick } : {})}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive ? "text-accent" : "text-ink-subtle group-hover:text-ink",
        )}
      />
      <span className="flex-1">{item.label}</span>
      {badge && badge > 0 ? (
        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-ink tabular-nums">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/* ── Sidebar content ── */
function SidebarContent({
  multisig,
  vaultName,
  pathname,
  base,
  inboxCount,
  onClose,
}: {
  multisig: string;
  vaultName?: string | undefined;
  pathname: string;
  base: string;
  inboxCount: number;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3">
        <Logo href="/" variant="full" size="sm" />
      </div>

      {/* Vault selector */}
      <div className="border-b border-border px-3 py-3">
        <VaultSelector multisig={multisig} name={vaultName} />
      </div>

      {/* Primary nav */}
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        {/* Main */}
        <div className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              base={base}
              pathname={pathname}
              {...(item.href === "/proposals" && inboxCount > 0 ? { badge: inboxCount } : {})}
              {...(onClose ? { onClick: onClose } : {})}
            />
          ))}
        </div>

        {/* Privacy section */}
        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            Privacy
          </p>
          <div className="flex flex-col gap-0.5">
            {PRIVACY_NAV.map((item) => (
              <NavLink
                key={item.label}
                item={item}
                base={base}
                pathname={pathname}
                {...(onClose ? { onClick: onClose } : {})}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <div className="flex flex-col gap-0.5">
          {BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              base={base}
              pathname={pathname}
              {...(onClose ? { onClick: onClose } : {})}
            />
          ))}
          <Link
            href="https://aegis.so/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <HelpCircle className="h-4 w-4 shrink-0 text-ink-subtle" />
            Help & Docs
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── AppShell ── */
export function AppShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ multisig: string }>();
  const pathname = usePathname();
  const multisig = params?.multisig ?? "";
  const base = `/vault/${multisig}`;

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [vaultName, setVaultName] = useState<string | undefined>();

  const { data: proposals = [], isLoading: proposalsLoading } = useProposalSummaries(multisig);
  const inboxItems = useMemo(
    () =>
      proposals
        .filter((p) => p.hasDraft && p.status === "executed")
        .map(
          (p): OperatorInboxItem => ({
            id: p.id,
            transactionIndex: p.transactionIndex,
            amount: p.totalAmount ?? p.amount,
            recipient: p.recipient,
            type: p.type === "payroll" ? "payroll" : "single",
            ...(p.recipientCount !== undefined ? { recipientCount: p.recipientCount } : {}),
            status: "pending",
          }),
        ),
    [proposals],
  );

  const [inboxOpen, setInboxOpen] = useState(false);

  useEffect(() => {
    if (!multisig) {
      setVaultName(undefined);
      return;
    }

    let cancelled = false;
    setVaultName(undefined);

    fetch(`/api/vaults/${encodeURIComponent(multisig)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((metadata: { name?: string } | null) => {
        if (!cancelled) setVaultName(metadata?.name || undefined);
      })
      .catch(() => {
        if (!cancelled) setVaultName(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [multisig]);

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <SidebarContent
          multisig={multisig}
          vaultName={vaultName}
          pathname={pathname}
          base={base}
          inboxCount={inboxItems.length}
        />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar — mobile only trigger + inbox */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-bg/90 px-4 backdrop-blur-xl md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo href="/" variant="monogram" size="sm" />
          <button
            type="button"
            onClick={() => setInboxOpen(true)}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
          >
            <Key className="h-4 w-4" />
            {inboxItems.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-ink">
                {inboxItems.length}
              </span>
            )}
          </button>
        </header>

        {/* Desktop topbar — just inbox */}
        <header className="sticky top-0 z-30 hidden h-14 items-center justify-end gap-3 border-b border-border bg-bg/90 px-6 backdrop-blur-xl md:flex">
          <OperatorInboxButton
            count={inboxItems.length}
            open={inboxOpen}
            onOpenChange={setInboxOpen}
          />
          <ClientWalletButton />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <WalletGuard>{children}</WalletGuard>
        </main>
      </div>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-surface shadow-raise-2">
            <div className="absolute right-3 top-3">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent
              multisig={multisig}
              vaultName={vaultName}
              pathname={pathname}
              base={base}
              inboxCount={inboxItems.length}
              onClose={() => setMobileNavOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Inbox sheet (shared) */}
      <OperatorInboxSheet
        open={inboxOpen}
        onOpenChange={setInboxOpen}
        multisig={multisig}
        items={inboxItems}
        loading={proposalsLoading}
      />
    </div>
  );
}

/* ── Inbox button (desktop topbar) ── */
function OperatorInboxButton({
  count,
  open,
  onOpenChange,
}: {
  count: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      className="relative inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <Key className="h-3.5 w-3.5" />
      Operator Inbox
      {count > 0 && (
        <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-ink">
          {count}
        </span>
      )}
    </button>
  );
}

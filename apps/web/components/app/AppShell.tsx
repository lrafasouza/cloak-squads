"use client";

import { BottomNav } from "@/components/app/BottomNav";
import { VaultSelector } from "@/components/app/VaultSelector";
import { Logo } from "@/components/brand/Logo";
import { Spinner } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import { useVaultBalance } from "@/lib/hooks/useVaultBalance";
import { isProposalExecuted } from "@/lib/operator-execution-history";
import { isProposalPendingStatus } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { useVaultMetadata } from "@/lib/use-vault-metadata";
import { cn } from "@/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  BookOpen,
  BookUser,
  FileText,
  HelpCircle,
  Key,
  LayoutDashboard,
  List,
  Menu,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CloakBanner } from "./CloakBanner";
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

const BOTTOM_NAV: NavItem[] = [
  { label: "Address Book", href: "/address-book", icon: BookUser },
  { label: "Settings", href: "/settings", icon: Settings },
];

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
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink hover:translate-x-0.5",
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      )}
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
      <div className="flex h-14 shrink-0 items-center gap-3 px-3">
        <Logo href="/" variant="full" size="sm" />
      </div>

      {/* Vault selector */}
      <div className="px-3 pb-3">
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
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle/70">
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

      {/* Cloak banner */}
      <div className="shrink-0 px-3 pb-2">
        <CloakBanner />
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 px-3 py-3">
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
            href="https://docs.aegis.cloak.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-subtle/70 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <HelpCircle className="h-4 w-4 shrink-0 text-ink-subtle/70" />
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
  const { publicKey } = useWallet();
  const { data: vault, isLoading: vaultLoading } = useVaultData(multisig);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { data: vaultMeta } = useVaultMetadata(multisig);
  const vaultName = vaultMeta?.name || undefined;
  const { data: proposals = [], isLoading: proposalsLoading } = useProposalSummaries(multisig);
  const { balanceSol, usdcUi } = useVaultBalance(multisig);
  const { data: solPrice } = useSolPrice();
  const solNum = Number.parseFloat(balanceSol) || 0;
  const usdcNum = Number.parseFloat(usdcUi) || 0;
  const totalUsd = solPrice != null ? solNum * solPrice + usdcNum : null;
  const usdValue =
    totalUsd != null
      ? totalUsd.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        })
      : null;

  const inboxItems = useMemo(
    () =>
      proposals
        .filter((p) => {
          if (!p.hasDraft) return false;
          if (isProposalPendingStatus(p.status)) return true;
          if (p.status === "executed" && !isProposalExecuted(multisig, p.transactionIndex))
            return true;
          return false;
        })
        .map(
          (p): OperatorInboxItem => ({
            id: p.id,
            transactionIndex: p.transactionIndex,
            amount: p.totalAmount ?? p.amount,
            recipient: p.recipient,
            type: p.type === "payroll" ? "payroll" : "single",
            ...(p.recipientCount !== undefined ? { recipientCount: p.recipientCount } : {}),
            status: p.status === "executed" ? "executed" : "pending",
          }),
        ),
    [proposals, multisig],
  );

  const [inboxOpen, setInboxOpen] = useState(false);
  const executedCount = useMemo(
    () => proposals.filter((p) => p.status === "executed").length,
    [proposals],
  );

  useEffect(() => {
    if (!multisig || executedCount === 0) return;
    const key = `aegis:executed-count:${multisig}`;
    const previous = Number(localStorage.getItem(key) ?? "0");
    if (previous > 0 && executedCount > previous) {
      // eslint-disable-next-line no-console
      console.info(
        `${executedCount - previous} signed proposal${
          executedCount - previous === 1 ? " was" : "s were"
        } executed by another member.`,
      );
    }
    localStorage.setItem(key, String(executedCount));
  }, [multisig, executedCount]);

  /* ── Membership gate state (computed after all hooks) ── */
  const walletAddress = publicKey?.toBase58();
  const isBlocked =
    !!multisig &&
    (vaultLoading || !vault || !walletAddress || !vault.members.includes(walletAddress));

  if (isBlocked) {
    if (vaultLoading) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-bg">
          <Spinner className="h-8 w-8 text-ink-subtle" />
        </div>
      );
    }
    if (!vault) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-bg px-4 text-center">
          <ShieldAlert className="h-10 w-10 text-signal-danger" />
          <h2 className="text-lg font-semibold text-ink">Unable to verify access</h2>
          <p className="max-w-xs text-sm text-ink-muted">
            Could not load vault membership. Please check your connection and try again.
          </p>
        </div>
      );
    }
    if (!walletAddress) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-bg px-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface shadow-raise-1">
            <Wallet className="h-7 w-7 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">Connect your wallet</h2>
            <p className="mt-1 max-w-xs text-sm text-ink-muted">
              You need to connect a wallet to access this vault.
            </p>
          </div>
          <div className="wallet-adapter-button-wrapper">
            <WalletMultiButton />
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-bg px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface shadow-raise-1">
          <ShieldAlert className="h-7 w-7 text-signal-danger" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">Wallet not authorized</h2>
          <p className="mt-1 max-w-xs text-sm text-ink-muted">
            The connected wallet is not a member of this vault. Switch to a member wallet to
            continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-white/[0.04] bg-surface/[0.5] backdrop-blur-xl md:flex md:flex-col">
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
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-white/[0.04] bg-surface/[0.6] px-4 backdrop-blur-xl md:hidden">
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

        {/* Desktop topbar */}
        <header className="sticky top-0 z-30 hidden h-14 items-center justify-end gap-3 border-b border-white/[0.04] bg-surface/[0.6] px-6 backdrop-blur-xl md:flex">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-muted cursor-default">
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="tabular-nums">
                    {usdValue ?? `${balanceSol} SOL`}
                  </span>
                </div>
              </TooltipTrigger>
              {usdValue != null && (
                <TooltipContent side="bottom">
                  <span className="tabular-nums">{balanceSol} SOL · {usdcUi} USDC</span>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <OperatorInboxButton
            count={inboxItems.length}
            open={inboxOpen}
            onOpenChange={setInboxOpen}
          />
          <ClientWalletButton />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto pb-20 md:pb-0">{children}</main>
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
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-white/[0.04] bg-surface/[0.85] shadow-raise-2 backdrop-blur-xl">
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

      {/* Bottom nav (mobile only) */}
      <BottomNav />

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

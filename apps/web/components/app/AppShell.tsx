"use client";

import { VaultSelector } from "@/components/app/VaultSelector";
import { Logo } from "@/components/brand/Logo";
import { Spinner } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import { useVaultBalance } from "@/lib/hooks/useVaultBalance";
import { isProposalPendingStatus } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { useVaultMetadata } from "@/lib/use-vault-metadata";
import { cn } from "@/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ArrowLeftRight,
  BookOpen,
  BookUser,
  ChevronDown,
  FileText,
  HelpCircle,
  Key,
  Layers,
  LayoutDashboard,
  List,
  Menu,
  RefreshCw,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Users,
  Wallet,
  X,
  Zap,
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

const WORKSPACE_NAV: NavItem[] = [
  { label: "Dashboard", href: "", icon: LayoutDashboard },
  { label: "Send Private", href: "/send", icon: Send },
  { label: "Swap", href: "/swap", icon: ArrowLeftRight },
  { label: "Payroll", href: "/payroll", icon: FileText },
  { label: "Operator", href: "/operator", icon: Key },
  { label: "Invoices", href: "/invoice", icon: BookOpen },
];

const GOVERNANCE_NAV: NavItem[] = [
  { label: "Transactions", href: "/proposals", icon: List },
  { label: "Members", href: "/members", icon: Users },
  { label: "Audit", href: "/audit", icon: Shield },
];

const PRIVACY_VAULT_NAV: NavItem[] = [
  { label: "Accounts", href: "/sub-vaults", icon: Layers },
  { label: "Spending Limits", href: "/limits", icon: Zap },
  { label: "Privacy", href: "/privacy", icon: ShieldAlert },
  { label: "Address Book", href: "/address-book", icon: BookUser },
];

const BOTTOM_NAV: NavItem[] = [
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

/* ── Collapsible nav section ── */
function CollapsibleSection({
  label,
  items,
  base,
  pathname,
  badge,
  badgeHref,
  onClose,
  storageKey,
  defaultOpen = true,
}: {
  label: string;
  items: NavItem[];
  base: string;
  pathname: string;
  badge?: number;
  badgeHref?: string;
  onClose?: () => void;
  storageKey: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) setOpen(saved === "true");
    } catch {}
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(storageKey, String(next)); } catch {}
      return next;
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle/60 transition-colors hover:text-ink-subtle"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform duration-200", open ? "" : "-rotate-90")}
        />
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-200"
        style={{ maxHeight: open ? "500px" : "0px" }}
      >
        <div className="flex flex-col gap-0.5 pt-0.5">
          {items.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              base={base}
              pathname={pathname}
              {...(badge !== undefined && item.href === badgeHref ? { badge } : {})}
              {...(onClose ? { onClick: onClose } : {})}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar content ── */
function SidebarContent({
  multisig,
  vaultName,
  pathname,
  base,
  queueCount,
  onClose,
}: {
  multisig: string;
  vaultName?: string | undefined;
  pathname: string;
  base: string;
  queueCount: number;
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
      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        <CollapsibleSection
          label="Workspace"
          items={WORKSPACE_NAV}
          base={base}
          pathname={pathname}
          storageKey="aegis:nav:workspace"
          defaultOpen
          {...(onClose ? { onClose } : {})}
        />
        <CollapsibleSection
          label="Governance"
          items={GOVERNANCE_NAV}
          base={base}
          pathname={pathname}
          {...(queueCount > 0 ? { badge: queueCount, badgeHref: "/proposals" } : {})}
          storageKey="aegis:nav:governance"
          defaultOpen
          {...(onClose ? { onClose } : {})}
        />
        <CollapsibleSection
          label="Privacy & Vault"
          items={PRIVACY_VAULT_NAV}
          base={base}
          pathname={pathname}
          storageKey="aegis:nav:privacy"
          defaultOpen
          {...(onClose ? { onClose } : {})}
        />
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
          <div className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-subtle/70">
            <HelpCircle className="h-4 w-4 shrink-0 text-ink-subtle/70" />
            Help & Docs
          </div>
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
  const { publicKey, connecting } = useWallet();
  const { data: vault, isLoading: vaultLoading, refetch: refetchVault } = useVaultData(multisig);

  // Wallet adapter restores autoConnect state after mount; during the first
  // ~600ms `publicKey` may be null even though the user is logged in. Wait
  // briefly before falling through to the "connect your wallet" gate to avoid
  // a jarring flash + duplicate sign-in prompt on every navigation.
  const [walletRestoreWaited, setWalletRestoreWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWalletRestoreWaited(true), 700);
    return () => clearTimeout(timer);
  }, []);

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

  const [executedMap, setExecutedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!multisig) return;
    const readMap = () => {
      try {
        const raw = localStorage.getItem(`aegis:operator-executed-map:${multisig}`);
        setExecutedMap(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
      } catch {
        setExecutedMap({});
      }
    };
    readMap();
    window.addEventListener("aegis:operator-executed", readMap);
    return () => window.removeEventListener("aegis:operator-executed", readMap);
  }, [multisig]);

  const [dismissedInboxIds, setDismissedInboxIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!multisig) return;
    try {
      const raw = localStorage.getItem(`aegis:inbox-dismissed:${multisig}`);
      setDismissedInboxIds(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch {
      setDismissedInboxIds(new Set());
    }
  }, [multisig]);

  const handleDismissInbox = (id: string) => {
    setDismissedInboxIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(`aegis:inbox-dismissed:${multisig}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const handleClearInbox = (ids: string[]) => {
    setDismissedInboxIds((prev) => {
      const next = new Set([...prev, ...ids]);
      try {
        localStorage.setItem(`aegis:inbox-dismissed:${multisig}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const inboxItems = useMemo(
    () =>
      proposals
        .filter((p) => {
          if (!p.hasDraft) return false;
          if (executedMap[p.transactionIndex]) return false;
          if (isProposalPendingStatus(p.status)) return true;
          if (p.status === "executed") return true;
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
    [proposals, multisig, executedMap],
  );

  const visibleInboxItems = useMemo(
    () => inboxItems.filter((item) => !dismissedInboxIds.has(item.id)),
    [inboxItems, dismissedInboxIds],
  );

  // Badge on the "Transactions" nav item — only active/approved proposals need
  // user attention. Executed proposals live in History, not the Queue.
  const queueCount = useMemo(
    () => proposals.filter((p) => p.status === "active" || p.status === "approved").length,
    [proposals],
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
      const delta = executedCount - previous;
      // eslint-disable-next-line no-console
      console.info(
        `${delta} signed proposal${delta === 1 ? "" : "s"} executed.`,
      );
    }
    localStorage.setItem(key, String(executedCount));
  }, [multisig, executedCount]);

  /* ── Membership gate state (computed after all hooks) ── */
  const walletAddress = publicKey?.toBase58();
  const walletRestoring = connecting || (!walletAddress && !walletRestoreWaited);
  const isBlocked =
    !!multisig &&
    (vaultLoading ||
      walletRestoring ||
      !vault ||
      !walletAddress ||
      !vault.members.includes(walletAddress));

  if (isBlocked) {
    if (vaultLoading || walletRestoring) {
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
          <button
            type="button"
            onClick={() => void refetchVault()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
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
          queueCount={queueCount}
        />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar — mobile only trigger + wallet + inbox */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-white/[0.04] bg-surface/[0.6] px-4 backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Logo href="/" variant="monogram" size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <ClientWalletButton />
            {visibleInboxItems.length > 0 && (
              <button
                type="button"
                onClick={() => setInboxOpen(true)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
              >
                <Key className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-ink">
                  {visibleInboxItems.length}
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Desktop topbar */}
        <header className="sticky top-0 z-30 hidden h-14 items-center justify-end gap-3 border-b border-white/[0.04] bg-surface/[0.6] px-6 backdrop-blur-xl md:flex">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-muted cursor-default">
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{usdValue ?? `${balanceSol} SOL`}</span>
                </div>
              </TooltipTrigger>
              {usdValue != null && (
                <TooltipContent side="bottom">
                  <span className="tabular-nums">
                    {balanceSol} SOL · {usdcUi} USDC
                  </span>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {visibleInboxItems.length > 0 && (
            <OperatorInboxButton
              count={visibleInboxItems.length}
              open={inboxOpen}
              onOpenChange={setInboxOpen}
            />
          )}
          <ClientWalletButton />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
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
          <aside className="absolute left-0 top-0 h-full w-[85vw] max-w-80 border-r border-white/[0.04] bg-surface/[0.85] shadow-raise-2 backdrop-blur-xl overflow-y-auto">
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
              queueCount={queueCount}
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
        items={visibleInboxItems}
        loading={proposalsLoading}
        onDismiss={handleDismissInbox}
        onClearAll={() => handleClearInbox(visibleInboxItems.map((i) => i.id))}
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

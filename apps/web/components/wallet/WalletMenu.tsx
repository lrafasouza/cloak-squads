"use client";

import { type Theme, useTheme } from "@/components/providers/ThemeProvider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { publicEnv } from "@/lib/env";
import { useRpcHealth } from "@/lib/hooks/useRpcHealth";
import { PROPOSAL_RENT_THRESHOLD_SOL, useWalletSolBalance } from "@/lib/hooks/useWalletSolBalance";
import { generateIdenticon } from "@/lib/identicon";
import { isProposalPendingStatus } from "@/lib/proposals";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { cn } from "@/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Fuel,
  LogOut,
  Monitor,
  Moon,
  Repeat,
  Shield,
  ShieldAlert,
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface WalletMenuProps {
  /** When provided, the menu shows membership + pending queue for this vault. */
  multisig?: string | undefined;
  /** Drop alignment relative to the trigger. Defaults to "end" (right-aligned). */
  align?: "start" | "end";
  className?: string;
}

const CLUSTER = publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER;
const CLUSTER_LABEL: Record<typeof CLUSTER, string> = {
  "mainnet-beta": "Mainnet",
  devnet: "Devnet",
  testnet: "Testnet",
  localnet: "Localnet",
};
const SOLSCAN_BASE = "https://solscan.io/account";
const solscanUrl = (addr: string) => {
  const suffix = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
  return `${SOLSCAN_BASE}/${addr}${suffix}`;
};

function formatSol(sol: number | null): string {
  if (sol === null) return "—";
  if (sol === 0) return "0";
  if (sol < 0.0001) return "<0.0001";
  if (sol < 1) return sol.toFixed(4);
  if (sol < 100) return sol.toFixed(3);
  return sol.toFixed(2);
}

export function WalletMenu({ multisig, align = "end", className }: WalletMenuProps) {
  const [mounted, setMounted] = useState(false);
  const { publicKey, disconnect, disconnecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Outside click (desktop popover only) + escape close.
  // Mobile sheet handles its own dismiss via the full-screen backdrop button —
  // and since the sheet is portaled to <body>, it isn't a descendant of `ref`,
  // so the contains() check would falsely fire on every tap inside the sheet.
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (isMobile) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", esc);
    };
  }, [open, isMobile]);

  // Lock body scroll when mobile sheet open
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const address = publicKey?.toBase58() ?? "";

  // Avoid hydration mismatch — render skeleton until mounted
  if (!mounted) {
    return (
      <div
        className="h-9 w-[148px] rounded-md border border-border-strong/60 bg-surface-2 animate-pulse"
        aria-hidden="true"
      />
    );
  }

  // Disconnected state — fall back to the canonical wallet adapter button.
  // It already opens the wallet selection modal with full Phantom/Backpack/etc support.
  if (!publicKey) {
    return (
      <div className={className}>
        <ClientWalletButton />
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — silently noop */
    }
  };

  const handleSwitch = () => {
    setOpen(false);
    setVisible(true);
  };

  const handleDisconnect = async () => {
    setOpen(false);
    try {
      await disconnect();
    } catch {
      /* adapter already surfaces errors via toast */
    }
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <TriggerPill address={address} open={open} onClick={() => setOpen((v) => !v)} />

      {open && !isMobile && (
        <div
          className={cn(
            "absolute top-full z-50 mt-2 w-[340px] origin-top",
            "animate-scale-in",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <MenuPanel
            address={address}
            multisig={multisig}
            copied={copied}
            disconnecting={disconnecting}
            onCopy={handleCopy}
            onSwitch={handleSwitch}
            onDisconnect={handleDisconnect}
            onCloseRequest={() => setOpen(false)}
          />
        </div>
      )}

      {open &&
        isMobile &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[60]">
            <button
              type="button"
              aria-label="Close wallet menu"
              className="absolute inset-0 bg-bg/75 backdrop-blur-sm animate-fade-in"
              onClick={() => setOpen(false)}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 right-0 max-h-[88dvh] overflow-hidden",
                "rounded-t-2xl border-t border-border bg-surface shadow-glass",
                "animate-fade-in-up",
              )}
            >
              <div className="flex items-center justify-center pt-2.5 pb-1">
                <div className="h-1 w-9 rounded-full bg-border-strong/80" />
              </div>
              <div className="flex items-center justify-between px-5 pb-2 pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-ink-subtle">
                  Connected wallet
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[calc(88dvh-3rem)] overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+12px)]">
                <MenuPanel
                  address={address}
                  multisig={multisig}
                  copied={copied}
                  disconnecting={disconnecting}
                  onCopy={handleCopy}
                  onSwitch={handleSwitch}
                  onDisconnect={handleDisconnect}
                  onCloseRequest={() => setOpen(false)}
                  variant="sheet"
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Trigger pill — sits in the topbar
 * ───────────────────────────────────────────────────────────────────────── */

function TriggerPill({
  address,
  open,
  onClick,
}: {
  address: string;
  open: boolean;
  onClick: () => void;
}) {
  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  const identicon = useMemo(() => generateIdenticon(address, 22), [address]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        "group relative inline-flex h-9 items-center gap-2 rounded-md border bg-surface px-1.5 pr-2.5",
        "text-[12px] font-medium text-ink transition-colors duration-150",
        open
          ? "border-accent/40 bg-surface-2 shadow-raise-1"
          : "border-border hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={identicon}
          alt=""
          aria-hidden="true"
          width={22}
          height={22}
          className="h-[22px] w-[22px] rounded-[5px]"
        />
        <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-signal-positive ring-2 ring-surface" />
      </span>
      <span className="font-mono tabular-nums tracking-tight">{short}</span>
      <ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 transition-transform duration-150",
          open ? "rotate-180 text-accent" : "text-ink-subtle group-hover:text-ink-muted",
        )}
      />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Menu panel — shared between desktop dropdown and mobile bottom-sheet
 * ───────────────────────────────────────────────────────────────────────── */

interface MenuPanelProps {
  address: string;
  multisig?: string | undefined;
  copied: boolean;
  disconnecting: boolean;
  onCopy: () => void;
  onSwitch: () => void;
  onDisconnect: () => void;
  onCloseRequest: () => void;
  variant?: "popover" | "sheet";
}

function MenuPanel({
  address,
  multisig,
  copied,
  disconnecting,
  onCopy,
  onSwitch,
  onDisconnect,
  onCloseRequest,
  variant = "popover",
}: MenuPanelProps) {
  const isPopover = variant === "popover";

  return (
    <TooltipProvider delayDuration={200}>
      <div
        aria-label="Wallet menu"
        className={cn(
          "flex flex-col",
          isPopover &&
            "overflow-hidden rounded-xl border border-border bg-surface/95 backdrop-blur-xl shadow-glass",
        )}
      >
        <IdentitySection address={address} copied={copied} onCopy={onCopy} />
        <Keyline />
        <StatsSection />
        {multisig && (
          <>
            <Keyline />
            <VaultSection multisig={multisig} address={address} onClose={onCloseRequest} />
          </>
        )}
        <Keyline />
        <AppearanceSection />
        <Keyline />
        <ActionsSection
          address={address}
          disconnecting={disconnecting}
          onSwitch={onSwitch}
          onDisconnect={onDisconnect}
        />
      </div>
    </TooltipProvider>
  );
}

function Keyline() {
  return (
    <div
      className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent"
      aria-hidden="true"
    />
  );
}

/* ─── Identity ───────────────────────────────────────────────────────────── */

function IdentitySection({
  address,
  copied,
  onCopy,
}: {
  address: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const identicon = useMemo(() => generateIdenticon(address, 44), [address]);
  const formatted = `${address.slice(0, 6)}…${address.slice(-6)}`;

  return (
    <div className="flex items-start gap-3 px-4 pb-4 pt-4">
      <div className="relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={identicon}
          alt=""
          aria-hidden="true"
          width={44}
          height={44}
          className="h-11 w-11 rounded-lg ring-1 ring-border"
        />
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-signal-positive ring-[3px] ring-surface"
          title="Connected"
        />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-ink-subtle">
            Signer
          </span>
          <span className="rounded-[4px] border border-accent/25 bg-accent-soft/60 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-accent">
            You
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[13px] tabular-nums text-ink">{formatted}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCopy}
              aria-label={copied ? "Copied" : "Copy address"}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 transition-colors",
                "hover:bg-surface-3 hover:text-ink",
                copied ? "text-signal-positive" : "text-ink-muted",
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{copied ? "Copied" : "Copy address"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/* ─── Stats (balance + network) ─────────────────────────────────────────── */

function StatsSection() {
  const { sol, insufficientForProposal } = useWalletSolBalance();
  const { data: rpc, isError, isPending } = useRpcHealth();

  const status: "green" | "yellow" | "red" = isError
    ? "red"
    : isPending
      ? "yellow"
      : (rpc?.latencyMs ?? 0) > 1500
        ? "red"
        : (rpc?.latencyMs ?? 0) > 500
          ? "yellow"
          : "green";

  const dotClass =
    status === "green"
      ? "bg-signal-positive"
      : status === "yellow"
        ? "bg-signal-warn"
        : "bg-signal-danger animate-pulse";

  return (
    <div className="grid grid-cols-2 divide-x divide-border/50">
      {/* Balance */}
      <div className="flex flex-col gap-1.5 px-4 pb-4 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-ink-subtle">
          Wallet balance
        </span>
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "font-display text-[22px] font-medium leading-none tabular-nums",
              insufficientForProposal ? "text-signal-warn" : "text-ink",
            )}
          >
            {formatSol(sol)}
          </span>
          <span className="text-[11px] font-medium text-ink-subtle">SOL</span>
        </div>
        {insufficientForProposal && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium text-signal-warn">
                <Fuel className="h-2.5 w-2.5" /> Low for fees
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px]">
              Below {PROPOSAL_RENT_THRESHOLD_SOL} SOL — creating a new proposal may fail. Top up
              this wallet to keep signing.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {/* Network */}
      <div className="flex flex-col gap-1.5 px-4 pb-4 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-ink-subtle">
          Network
        </span>
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
          <span className="text-[14px] font-medium leading-none text-ink">
            {CLUSTER_LABEL[CLUSTER]}
          </span>
        </div>
        <span className="text-[10px] font-medium tabular-nums text-ink-subtle">
          {rpc?.latencyMs != null ? `${rpc.latencyMs}ms` : "Probing…"}
          {rpc?.slot != null && (
            <>
              <span className="mx-1 opacity-50">·</span>
              <span title={`Slot ${rpc.slot}`}>slot {compactSlot(rpc.slot)}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function compactSlot(slot: number): string {
  if (slot >= 1_000_000) return `${(slot / 1_000_000).toFixed(slot >= 10_000_000 ? 0 : 1)}M`;
  if (slot >= 1000) return `${Math.round(slot / 1000)}k`;
  return String(slot);
}

/* ─── Vault context (optional) ──────────────────────────────────────────── */

function VaultSection({
  multisig,
  address,
  onClose,
}: {
  multisig: string;
  address: string;
  onClose: () => void;
}) {
  const { data: vault, isLoading } = useVaultData(multisig);
  const { data: proposals = [] } = useProposalSummaries(multisig);

  const isMember = useMemo(() => Boolean(vault?.members.includes(address)), [vault, address]);

  const queueCount = useMemo(
    () =>
      proposals.filter((p) => p.status && isProposalPendingStatus(p.status) && p.status !== "draft")
        .length,
    [proposals],
  );

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-ink-subtle">
        This vault
      </span>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
          {isLoading ? (
            <span className="h-3 w-3 animate-pulse rounded-sm bg-surface-3" />
          ) : isMember ? (
            <Shield className="h-3.5 w-3.5 text-signal-positive" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 text-signal-danger" />
          )}
          {isLoading ? "Checking access" : isMember ? "Member of this vault" : "Not authorized"}
        </span>
      </div>
      {isMember && (
        <Link
          href={`/vault/${multisig}/proposals`}
          onClick={onClose}
          className={cn(
            "group flex items-center justify-between rounded-md px-2 py-1.5 -mx-2",
            "text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink",
          )}
        >
          <span>Pending queue</span>
          <span className="inline-flex items-center gap-1.5">
            {queueCount > 0 ? (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold tabular-nums text-accent-ink">
                {queueCount}
              </span>
            ) : (
              <span className="text-[11px] tabular-nums text-ink-subtle">0</span>
            )}
            <span className="text-ink-subtle transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </Link>
      )}
    </div>
  );
}

/* ─── Appearance ────────────────────────────────────────────────────────── */

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-ink-subtle">
        Appearance
      </span>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex items-center rounded-md border border-border bg-surface-2 p-0.5"
      >
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={label}
              onClick={() => setTheme(value)}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-[5px] transition-aegis",
                active
                  ? "bg-accent text-accent-ink shadow-raise-1"
                  : "text-ink-subtle hover:bg-surface-3 hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Actions ───────────────────────────────────────────────────────────── */

function ActionsSection({
  address,
  disconnecting,
  onSwitch,
  onDisconnect,
}: {
  address: string;
  disconnecting: boolean;
  onSwitch: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex flex-col p-1.5">
      <a
        href={solscanUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <ExternalLink className="h-3.5 w-3.5 text-ink-subtle group-hover:text-ink-muted" />
        <span className="flex-1">View on Solscan</span>
        <span className="text-ink-subtle/70 group-hover:text-ink-subtle">↗</span>
      </a>
      <button
        type="button"
        onClick={onSwitch}
        className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Repeat className="h-3.5 w-3.5 text-ink-subtle group-hover:text-ink-muted" />
        <span className="flex-1">Switch wallet</span>
      </button>
      <div className="my-1 h-px bg-border/60" aria-hidden="true" />
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disconnecting}
        className={cn(
          "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
          "text-signal-danger/90 hover:bg-signal-danger/10 hover:text-signal-danger",
          disconnecting && "opacity-50 cursor-wait",
        )}
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="flex-1">{disconnecting ? "Disconnecting…" : "Disconnect"}</span>
      </button>
    </div>
  );
}

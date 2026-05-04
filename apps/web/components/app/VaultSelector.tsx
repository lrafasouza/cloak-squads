"use client";

import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { truncateAddress } from "@/lib/proposals";
import { useMyVaults } from "@/lib/use-my-vaults";
import { cn } from "@/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  Check,
  ChevronsUpDown,
  Download,
  Loader2,
  LogOut,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

interface VaultSelectorProps {
  multisig: string;
  name?: string | undefined;
  className?: string;
}

function VaultRow({
  addr,
  label,
  onNavigate,
  onRemove,
}: {
  addr: string;
  label?: string;
  onNavigate: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group flex items-center gap-1 rounded-lg transition-colors hover:bg-surface-2">
      <button
        type="button"
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left"
      >
        <VaultIdenticon seed={addr} size={28} className="rounded-md" />
        <div className="min-w-0 flex-1">
          {label ? (
            <>
              <p className="truncate text-xs font-medium text-ink">{label}</p>
              <p className="font-mono text-[10px] text-ink-subtle">{truncateAddress(addr)}</p>
            </>
          ) : (
            <p className="font-mono text-xs text-ink">{truncateAddress(addr)}</p>
          )}
        </div>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle opacity-0 transition-all hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
          aria-label={`Remove ${truncateAddress(addr)} from recent vaults`}
          title="Remove from recent"
        >
          <LogOut className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

interface ContentProps {
  multisig: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  switchInput: string;
  setSwitchInput: (v: string) => void;
  handleSwitch: () => void;
  connected: boolean;
  myVaultsLoading: boolean;
  filteredMyVaults: { cofreAddress: string; name?: string | null }[];
  handleNavigate: (addr: string) => void;
  query: string;
  hasResults: boolean;
  onClose: () => void;
}

function VaultSelectorContent({
  multisig,
  inputRef,
  switchInput,
  setSwitchInput,
  handleSwitch,
  connected,
  myVaultsLoading,
  filteredMyVaults,
  handleNavigate,
  query,
  hasResults,
  onClose,
}: ContentProps) {
  return (
    <>
      {/* Search / Switch */}
      <div className="border-b border-border bg-surface-2/50 p-3">
        <div className="relative flex items-center gap-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <input
            ref={inputRef}
            type="text"
            value={switchInput}
            onChange={(e) => setSwitchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSwitch()}
            placeholder="Search vaults or paste address…"
            className="h-9 flex-1 rounded-lg border border-border bg-surface pl-8 pr-2 text-xs text-ink placeholder:text-ink-subtle focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
          {switchInput.trim() && (
            <button
              type="button"
              onClick={handleSwitch}
              className="h-9 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Go
            </button>
          )}
        </div>
      </div>

      {/* Vault list */}
      <div className="max-h-[320px] overflow-y-auto p-1.5">
        {connected && myVaultsLoading && (
          <div className="flex items-center justify-center gap-2 px-2.5 py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-subtle" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              Loading your vaults…
            </p>
          </div>
        )}

        {connected && filteredMyVaults.length > 0 && (
          <div className="mb-1">
            <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              Your Vaults
            </p>
            <div className="space-y-0.5">
              {filteredMyVaults
                .filter((v) => v.cofreAddress !== multisig)
                .map((vault) => (
                  <VaultRow
                    key={vault.cofreAddress}
                    addr={vault.cofreAddress}
                    label={vault.name || truncateAddress(vault.cofreAddress)}
                    onNavigate={() => handleNavigate(vault.cofreAddress)}
                  />
                ))}
            </div>
          </div>
        )}

        {query && !hasResults && !myVaultsLoading && (
          <div className="px-2.5 py-4 text-center">
            <p className="text-xs text-ink-subtle">
              No vaults found matching &quot;{switchInput.trim()}&quot;
            </p>
            <p className="mt-1 text-[10px] text-ink-subtle">
              Press Enter or tap Go to navigate by address
            </p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border bg-surface-2/30 p-1.5">
        <Link
          href="/create"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-accent/40 bg-accent-soft/50">
            <Plus className="h-3.5 w-3.5 text-accent" />
          </div>
          <span>Create new vault</span>
        </Link>
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface">
            <Download className="h-3.5 w-3.5" />
          </div>
          <span>Import existing vault</span>
        </button>
        <Link
          href={`/vault/${multisig}/settings`}
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface">
            <Settings className="h-3.5 w-3.5" />
          </div>
          <span>Manage vaults</span>
        </Link>
      </div>
    </>
  );
}

export function VaultSelector({ multisig, name, className }: VaultSelectorProps) {
  const { connected } = useWallet();
  const { vaults: myVaults, loading: myVaultsLoading } = useMyVaults();

  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [switchInput, setSwitchInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const displayName = name || truncateAddress(multisig);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const query = switchInput.trim().toLowerCase();

  const filteredMyVaults = useMemo(() => {
    if (!query) return myVaults;
    return myVaults.filter(
      (v) => v.cofreAddress.toLowerCase().includes(query) || v.name?.toLowerCase().includes(query),
    );
  }, [myVaults, query]);

  const hasResults = filteredMyVaults.length > 0;

  const handleSwitch = () => {
    const addr = switchInput.trim();
    if (!addr) return;
    try {
      new PublicKey(addr);
      window.location.href = `/vault/${addr}`;
    } catch {
      /* invalid pubkey */
    }
  };

  const handleNavigate = (addr: string) => {
    setOpen(false);
    window.location.href = `/vault/${addr}`;
  };

  const handleExitCurrentVault = () => {
    window.location.href = "/vault";
  };

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      {/* Active Vault Card */}
      <div
        className={cn(
          "group flex w-full items-center gap-2 rounded-xl border bg-surface p-3 text-left transition-all duration-150",
          open
            ? "border-accent/50 bg-surface shadow-raise-1"
            : "border-border bg-surface hover:border-border-strong hover:bg-surface-2 hover:shadow-raise-1",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <div className="relative shrink-0">
            <VaultIdenticon seed={multisig} size={36} className="rounded-lg" />
            <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-signal-success ring-2 ring-surface">
              <Check className="h-2 w-2 text-white" strokeWidth={3} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleExitCurrentVault}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle opacity-0 transition-all hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
            aria-label="Exit current vault"
            title="Exit vault"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
          <ChevronsUpDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors",
              open ? "text-accent" : "text-ink-subtle group-hover:text-ink",
            )}
          />
        </div>
      </div>

      {/* Desktop dropdown */}
      {open && !isMobile && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-raise-2">
          <VaultSelectorContent
            multisig={multisig}
            inputRef={inputRef}
            switchInput={switchInput}
            setSwitchInput={setSwitchInput}
            handleSwitch={handleSwitch}
            connected={connected}
            myVaultsLoading={myVaultsLoading}
            filteredMyVaults={filteredMyVaults}
            handleNavigate={handleNavigate}
            query={query}
            hasResults={hasResults}
            onClose={() => setOpen(false)}
          />
        </div>
      )}

      {/* Mobile full-screen bottom sheet */}
      {open && isMobile && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close vault switcher"
            className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-raise-2">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3.5">
              <h3 className="text-sm font-semibold text-ink">Switch Vault</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <VaultSelectorContent
                multisig={multisig}
                inputRef={inputRef}
                switchInput={switchInput}
                setSwitchInput={setSwitchInput}
                handleSwitch={handleSwitch}
                connected={connected}
                myVaultsLoading={myVaultsLoading}
                filteredMyVaults={filteredMyVaults}
                handleNavigate={handleNavigate}
                query={query}
                hasResults={hasResults}
                onClose={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

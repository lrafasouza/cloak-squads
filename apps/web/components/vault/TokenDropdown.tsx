"use client";

import { TokenLogo } from "@/components/ui/token-logo";
import type { VaultToken } from "@/lib/hooks/useVaultTokens";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TokenDropdownProps {
  tokens: VaultToken[];
  selectedMint: string;
  onSelect: (mint: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function TokenDropdown({
  tokens = [],
  selectedMint,
  onSelect,
  disabled,
  loading,
}: TokenDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = tokens.find((t) => t.mint === selectedMint) ?? tokens[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && !loading && setOpen((v) => !v)}
        disabled={disabled || loading}
        className="flex h-11 min-w-[110px] items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {loading ? (
          <span className="h-5 w-5 animate-pulse rounded-full bg-surface-2" />
        ) : selected ? (
          <TokenLogo symbol={selected.symbol as "SOL" | "USDC"} size={20} />
        ) : null}
        <span>{loading ? "—" : (selected?.symbol ?? "SOL")}</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-xl border border-border bg-surface shadow-lg ring-1 ring-black/5">
          {loading ? (
            <div className="px-4 py-3 text-xs text-ink-muted">Loading tokens…</div>
          ) : tokens.length === 0 ? (
            <div className="px-4 py-3 text-xs text-ink-muted">No tokens found</div>
          ) : (
            tokens.map((t) => {
              const active = t.mint === selectedMint;
              return (
                <button
                  key={t.mint}
                  type="button"
                  onClick={() => {
                    onSelect(t.mint);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-2 ${active ? "text-accent" : "text-ink"}`}
                >
                  <TokenLogo symbol={t.symbol as "SOL" | "USDC"} size={18} />
                  <span className="flex-1 text-left font-medium">{t.symbol}</span>
                  <span className="font-mono text-xs text-ink-muted">{t.uiBalance}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { Input } from "@/components/ui/input";
import { findEntryByAddress, useAddressBook, type AddressBookEntry } from "@/lib/hooks/useAddressBook";
import { cn } from "@/lib/utils";
import { PublicKey } from "@solana/web3.js";
import { BookUser, Check, Plus, X } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

function isValidPubkey(value: string): boolean {
  if (!value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function abbrev(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

type RecipientInputProps = {
  /** Current address value (base58). */
  value: string;
  /** Called whenever the address string changes. */
  onChange: (address: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  autoFocus?: boolean;
};

/**
 * Combobox for entering a Solana address with autocomplete from the user's
 * address book. The input itself always holds the raw base58 address (so the
 * parent form never has to worry about labels). Above the input we show a
 * matched contact label (if any). Below the input, when the address is valid
 * and not yet saved, a one-click "Save as contact" affordance appears.
 */
export function RecipientInput({
  value,
  onChange,
  placeholder = "Solana wallet address or saved contact",
  disabled,
  required,
  id,
  className,
  autoFocus,
}: RecipientInputProps) {
  const { entries, create, creating } = useAddressBook();
  const [searchTerm, setSearchTerm] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Keep internal search synced with external value
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const matchedEntry = useMemo(() => findEntryByAddress(entries, value), [entries, value]);

  const filteredEntries = useMemo(() => {
    if (!searchTerm) return entries;
    const q = searchTerm.toLowerCase();
    return entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.address.toLowerCase().includes(q),
    );
  }, [entries, searchTerm]);

  const valueIsValid = isValidPubkey(value);
  const showSuggestions = isFocused && filteredEntries.length > 0 && !showSavePrompt;
  const canPromptSave =
    valueIsValid && !matchedEntry && !showSavePrompt && entries.length >= 0;

  function handleSelect(entry: AddressBookEntry) {
    onChange(entry.address);
    setSearchTerm(entry.address);
    setIsFocused(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filteredEntries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const target = filteredEntries[highlight];
      if (target) {
        e.preventDefault();
        handleSelect(target);
      }
    } else if (e.key === "Escape") {
      setIsFocused(false);
    }
  }

  async function handleSaveContact() {
    if (!labelDraft.trim() || !valueIsValid) return;
    setSaveError(null);
    try {
      await create({ label: labelDraft.trim(), address: value });
      setShowSavePrompt(false);
      setLabelDraft("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save contact.");
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Matched contact pill */}
      {matchedEntry ? (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
          <BookUser className="h-3.5 w-3.5 text-accent" />
          <span className="font-medium text-ink">{matchedEntry.label}</span>
          {matchedEntry.notes ? (
            <span className="truncate text-ink-subtle">— {matchedEntry.notes}</span>
          ) : null}
        </div>
      ) : null}

      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => {
          const next = e.target.value.trim();
          setSearchTerm(e.target.value);
          onChange(next);
          setHighlight(0);
        }}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKey}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
      />

      {/* Suggestions dropdown */}
      {showSuggestions ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
          {filteredEntries.map((entry, idx) => (
            <button
              key={entry.id}
              type="button"
              onMouseDown={(e) => {
                // mousedown to fire before input blur
                e.preventDefault();
                handleSelect(entry);
              }}
              onMouseEnter={() => setHighlight(idx)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                idx === highlight ? "bg-surface-2" : "bg-transparent",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{entry.label}</div>
                <div className="truncate font-mono text-[11px] text-ink-subtle">
                  {abbrev(entry.address)}
                </div>
              </div>
              {entry.address === value ? (
                <Check className="h-4 w-4 shrink-0 text-accent" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* Save-as-contact prompt */}
      {canPromptSave ? (
        <button
          type="button"
          onClick={() => {
            setShowSavePrompt(true);
            setLabelDraft("");
            setSaveError(null);
            // focus label input on next tick
            setTimeout(() => labelInputRef.current?.focus(), 0);
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent transition-colors hover:text-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          Save as contact
        </button>
      ) : null}

      {showSavePrompt ? (
        <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">New contact</span>
            <button
              type="button"
              onClick={() => {
                setShowSavePrompt(false);
                setSaveError(null);
              }}
              className="text-ink-subtle hover:text-ink"
              aria-label="Cancel save"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              ref={labelInputRef}
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder="Contact label (e.g. Treasury, Alice)"
              maxLength={64}
              className="min-h-9 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSaveContact();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void handleSaveContact()}
              disabled={!labelDraft.trim() || creating}
              className="inline-flex items-center justify-center rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-ink-subtle">{value}</div>
          {saveError ? <p className="mt-1 text-xs text-signal-danger">{saveError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

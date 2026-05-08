"use client";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import {
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { type AddressBookEntry, useAddressBook } from "@/lib/hooks/useAddressBook";
import { cn } from "@/lib/utils";
import { PublicKey } from "@solana/web3.js";
import {
  BookUser,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function abbrev(addr: string, chars = 6) {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function isValidPubkey(value: string): boolean {
  if (!value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/* ── New-contact modal ──────────────────────────────────────────────────
   Mirrors the AddMember (/members) and AddAccount (/sub-vaults) modal
   pattern: gold seal across the top, eyebrow + display title, identicon
   that swaps in live as the address validates, three input fields,
   Cancel/Save actions. Reachable from the header CTA, the empty-state
   CTA, and the "no contact selected" panel. */
function NewContactModal({
  open,
  onClose,
  onCreate,
  creating,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { label: string; address: string; notes?: string }) => Promise<unknown>;
  creating: boolean;
}) {
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  /* Reset + focus on each open. We avoid mounting/unmounting the inputs
     so the autofocus arrives on the next tick after open flips true. */
  useEffect(() => {
    if (open) {
      setLabel("");
      setAddress("");
      setNotes("");
      setError(null);
      setTimeout(() => labelRef.current?.focus(), 0);
    }
  }, [open]);

  const addressValid = isValidPubkey(address.trim());

  async function handleSubmit() {
    setError(null);
    const trimmedLabel = label.trim();
    const trimmedAddress = address.trim();
    if (!trimmedLabel) {
      setError("Label is required.");
      return;
    }
    if (!isValidPubkey(trimmedAddress)) {
      setError("Invalid Solana address.");
      return;
    }
    try {
      const input: { label: string; address: string; notes?: string } = {
        label: trimmedLabel,
        address: trimmedAddress,
      };
      if (notes.trim()) input.notes = notes.trim();
      await onCreate(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !creating) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !creating) onClose();
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: <dialog> element doesn't fit the heraldic frame; manual a11y via role+aria-modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ab-new-title"
        className="relative w-full max-w-md overflow-hidden rounded-modal border border-border bg-surface p-6 shadow-raise-2"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent/0 via-accent to-accent/0"
        />
        <p className="text-eyebrow">Address book · New contact</p>
        <h3
          id="ab-new-title"
          className="mt-0.5 font-display text-xl font-semibold tracking-tight text-ink"
        >
          Save a contact
        </h3>
        <p className="mt-1.5 text-sm text-ink-muted">
          Saved with your connected wallet — available across every vault for quick recipient
          selection.
        </p>

        {/* Identity preview — identicon swaps in once the address is valid */}
        <div className="mt-5 flex items-center gap-3 rounded-list border border-border bg-bg/40 px-3 py-2.5">
          <div className="shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2">
            {addressValid ? (
              <VaultIdenticon seed={address.trim()} size={40} />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center text-ink-subtle">
                <BookUser className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {label.trim() || <span className="text-ink-subtle">Contact label</span>}
            </p>
            <p className="font-mono text-[11px] text-ink-subtle">
              {addressValid ? abbrev(address.trim()) : "Solana address preview"}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="ab-new-label" className="mb-1 block text-eyebrow">
              Label
            </label>
            <input
              id="ab-new-label"
              ref={labelRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              maxLength={64}
              placeholder="Treasury, Alice, Vendor…"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-ink placeholder-ink-subtle focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ab-new-address" className="mb-1 block text-eyebrow">
              Wallet address
            </label>
            <input
              id="ab-new-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && addressValid && label.trim() && !creating) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              maxLength={44}
              placeholder="Solana public key"
              spellCheck={false}
              className={cn(
                "w-full rounded-md border bg-surface-2 px-3 py-2 font-mono text-sm text-ink placeholder-ink-subtle focus:outline-none",
                addressValid
                  ? "border-accent/40 focus:border-accent"
                  : address.trim()
                    ? "border-signal-danger/40"
                    : "border-border focus:border-accent",
              )}
            />
          </div>

          <div>
            <label htmlFor="ab-new-notes" className="mb-1 block text-eyebrow">
              Note <span className="text-ink-subtle/70">(optional)</span>
            </label>
            <input
              id="ab-new-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && addressValid && label.trim() && !creating) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              maxLength={280}
              placeholder="Vendor for design retainer…"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder-ink-subtle focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-signal-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={creating || !label.trim() || !addressValid}
            className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-accent-hover px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {creating ? "Saving…" : "Save contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit form ── */
function EditContactForm({
  entry,
  onSave,
  onCancel,
  saving,
}: {
  entry: AddressBookEntry;
  onSave: (id: string, patch: { label?: string; notes?: string | null }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [label, setLabel] = useState(entry.label);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => labelRef.current?.focus(), 0);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    const patch: { label?: string; notes?: string | null } = {};
    if (trimmedLabel !== entry.label) patch.label = trimmedLabel;
    const nextNotes = notes.trim() || null;
    if (nextNotes !== entry.notes) patch.notes = nextNotes;
    if (Object.keys(patch).length > 0) {
      await onSave(entry.id, patch);
    }
    onCancel();
  }, [label, notes, entry, onSave, onCancel]);

  return (
    <Panel>
      <PanelHeader
        icon={Pencil}
        title="Edit contact"
        description="Address is locked — delete and re-add to change it."
      />
      <PanelBody className="space-y-4">
        <div className="flex items-center gap-3 rounded-list border border-border bg-bg/40 px-3 py-2.5">
          <div className="shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2">
            <VaultIdenticon seed={entry.address} size={40} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{entry.label}</p>
            <p className="font-mono text-[11px] text-ink-subtle">{abbrev(entry.address)}</p>
          </div>
        </div>

        <div>
          <label htmlFor={`ab-edit-label-${entry.id}`} className="mb-1 block text-eyebrow">
            Label
          </label>
          <input
            id={`ab-edit-label-${entry.id}`}
            ref={labelRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={64}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </div>

        <div>
          <label htmlFor={`ab-edit-notes-${entry.id}`} className="mb-1 block text-eyebrow">
            Note
          </label>
          <input
            id={`ab-edit-notes-${entry.id}`}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={280}
            placeholder="Optional note about this contact"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => void handleSave()}
            disabled={saving || !label.trim()}
            className="flex-1"
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      </PanelBody>
    </Panel>
  );
}

/* ── Contact row ── */
function ContactRow({
  entry,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onCopy,
  removing,
}: {
  entry: AddressBookEntry;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  removing: boolean;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: native <button> can't host the absolute action buttons inside
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Select ${entry.label}`}
      aria-pressed={isSelected}
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 transition-aegis",
        "cursor-pointer hover:bg-surface-2/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
        isSelected && "bg-surface-2/80",
        removing && "opacity-50",
      )}
    >
      {isSelected && (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brass"
        />
      )}

      <div className="relative z-10 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2">
        <VaultIdenticon seed={entry.address} size={40} />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{entry.label}</p>
          {entry.notes && (
            <StickyNote className="h-3 w-3 shrink-0 text-ink-subtle" aria-label="Has note" />
          )}
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">{abbrev(entry.address)}</p>
        {entry.notes && (
          <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-ink-muted">
            {entry.notes}
          </p>
        )}
      </div>

      <div
        className={cn(
          "relative z-10 flex shrink-0 items-center gap-1 transition-opacity",
          "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          isSelected && "sm:opacity-100",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-ink"
          aria-label="Copy address"
          title="Copy address"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-ink"
          aria-label="Edit contact"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-signal-danger/15 hover:text-signal-danger"
          aria-label="Delete contact"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ── Page ── */
export default function AddressBookPage() {
  const {
    entries,
    isLoading,
    isError,
    error,
    update,
    remove,
    create,
    updating,
    removing,
    creating,
  } = useAddressBook();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.address.toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q),
    );
  }, [entries, search]);

  /* Default selection — the first entry once loaded. */
  const effectiveSelected = useMemo(() => {
    if (!entries.length) return null;
    if (selectedId && entries.find((e) => e.id === selectedId)) return selectedId;
    return entries[0]?.id ?? null;
  }, [entries, selectedId]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === effectiveSelected) ?? null,
    [entries, effectiveSelected],
  );

  const handleUpdate = useCallback(
    async (id: string, patch: { label?: string; notes?: string | null }) => {
      await update({ id, ...patch });
    },
    [update],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteId) return;
    await remove(deleteId);
    setDeleteId(null);
    if (selectedId === deleteId) setSelectedId(null);
  }, [deleteId, remove, selectedId]);

  const entryToDelete = useMemo(() => entries.find((e) => e.id === deleteId), [entries, deleteId]);
  const editingEntry = useMemo(() => entries.find((e) => e.id === editId), [entries, editId]);

  const copy = (id: string, address: string) => {
    void navigator.clipboard.writeText(address);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  /* Aggregates for the hero ledger */
  const stats = useMemo(() => {
    const withNotes = entries.filter((e) => !!e.notes).length;
    const recent = entries.filter((e) => {
      const t = Date.parse(e.createdAt);
      return Number.isFinite(t) && Date.now() - t < 1000 * 60 * 60 * 24 * 7;
    }).length;
    return { total: entries.length, withNotes, recent };
  }, [entries]);

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Wallet · Contacts"
        title="Address book"
        description="Saved wallet addresses live with your account, not the vault. They're available across every vault you connect to for quick recipient selection."
        action={
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setEditId(null);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-accent-hover px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow"
          >
            <Plus className="h-4 w-4" />
            New contact
          </button>
        }
      />

      {/* ── Hero · contacts summary ── */}
      <div className="card-hero mb-6 overflow-hidden p-6 md:p-7">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-eyebrow">Contacts ledger</p>
            <p className="mt-1.5 font-display text-4xl font-semibold leading-none tracking-tight text-ink md:text-5xl">
              {stats.total}
              <span className="ml-2 font-sans text-base font-medium text-ink-subtle md:text-lg">
                saved
              </span>
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              {stats.total === 0
                ? "Save a recipient when you send funds, or add one manually below."
                : `${stats.withNotes} annotated · ${stats.recent} added this week`}
            </p>
          </div>

          <div className="hidden gap-5 md:flex md:flex-wrap md:justify-end">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <BookUser className="h-3 w-3 text-ink-subtle" aria-hidden="true" />
                <span className="text-eyebrow">Total</span>
              </div>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
                {stats.total}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <StickyNote className="h-3 w-3 text-ink-subtle" aria-hidden="true" />
                <span className="text-eyebrow">With notes</span>
              </div>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
                {stats.withNotes}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <Plus className="h-3 w-3 text-ink-subtle" aria-hidden="true" />
                <span className="text-eyebrow">This week</span>
              </div>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
                {stats.recent}
              </p>
            </div>
          </div>
        </div>
      </div>

      {isError && error ? (
        <div className="mb-6">
          <InlineAlert tone="danger">{error.message}</InlineAlert>
        </div>
      ) : null}

      {/* ── Master / detail ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — list */}
        <div className="card-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div>
              <p className="text-eyebrow">Saved contacts</p>
              <h2 className="mt-0.5 font-display text-lg font-semibold tracking-tight text-ink">
                {filtered.length === entries.length
                  ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`
                  : `${filtered.length} of ${entries.length}`}
              </h2>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
              <input
                type="text"
                placeholder="Search label, address, note…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(
                  "h-9 w-44 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-ink",
                  "placeholder:text-ink-subtle",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  "md:w-64",
                )}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-[60px] w-full" />
              <Skeleton className="h-[60px] w-full" />
              <Skeleton className="h-[60px] w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-ink-subtle">
                <BookUser className="h-5 w-5" />
              </div>
              <p className="mt-4 text-eyebrow">{search.trim() ? "No matches" : "Empty book"}</p>
              <h3 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
                {search.trim() ? "Nothing matches that search" : "No contacts yet"}
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
                {search.trim()
                  ? "Try a different label, address fragment, or note keyword."
                  : "Add contacts manually or save them when you send funds — they'll autofill recipient inputs across the app."}
              </p>
              {!search.trim() && !isAdding && (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-ink-muted transition-aegis hover:border-border-strong hover:text-ink"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add your first contact
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filtered.map((entry) => (
                <ContactRow
                  key={entry.id}
                  entry={entry}
                  isSelected={effectiveSelected === entry.id}
                  onSelect={() => {
                    setSelectedId(entry.id);
                    setEditId(null);
                    setIsAdding(false);
                  }}
                  onEdit={() => {
                    setEditId(entry.id);
                    setSelectedId(entry.id);
                    setIsAdding(false);
                  }}
                  onDelete={() => setDeleteId(entry.id)}
                  onCopy={() => copy(entry.id, entry.address)}
                  removing={removing && deleteId === entry.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — sticky inspector / edit form */}
        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          {editingEntry ? (
            <EditContactForm
              entry={editingEntry}
              onSave={handleUpdate}
              onCancel={() => setEditId(null)}
              saving={updating}
            />
          ) : selectedEntry ? (
            <Panel>
              <PanelHeader
                icon={BookUser}
                title="Selected contact"
                description="Inspect, edit, or copy this address."
              />
              <PanelBody className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2">
                    <VaultIdenticon seed={selectedEntry.address} size={48} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{selectedEntry.label}</p>
                    <p className="font-mono text-[11px] text-ink-subtle">
                      {abbrev(selectedEntry.address, 10)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1 rounded-list border border-border bg-bg/40 px-3 py-2">
                  <p className="text-eyebrow">Wallet address</p>
                  <p className="break-all font-mono text-[11px] leading-relaxed text-ink">
                    {selectedEntry.address}
                  </p>
                </div>

                {selectedEntry.notes ? (
                  <div className="rounded-list border border-border bg-bg/40 px-3 py-2.5">
                    <p className="text-eyebrow">Note</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink">{selectedEntry.notes}</p>
                  </div>
                ) : (
                  <p className="rounded-list border border-dashed border-border bg-bg/40 px-3 py-2 text-[11px] leading-relaxed text-ink-subtle">
                    No note. Add context — vendor, role, why you saved them — to help future-you.
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copy(selectedEntry.id, selectedEntry.address)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
                  >
                    {copiedId === selectedEntry.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-signal-positive" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                  <a
                    href={`https://solana.fm/address/${selectedEntry.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Explorer
                  </a>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditId(selectedEntry.id)}
                    className="flex-1"
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteId(selectedEntry.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </PanelBody>
            </Panel>
          ) : (
            <Panel>
              <PanelHeader
                icon={BookUser}
                title="No contact selected"
                description="Pick one on the left, or add a new one."
              />
              <PanelBody>
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-list border border-dashed border-border px-4 py-3 text-xs font-medium text-ink-muted transition-aegis hover:border-border-strong hover:text-ink"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add contact
                </button>
              </PanelBody>
            </Panel>
          )}

          <div className="card-panel space-y-2 px-4 py-3">
            <p className="text-eyebrow">Notes</p>
            <ul className="space-y-1.5 text-[11px] leading-relaxed text-ink-muted">
              <li>
                • Contacts live with your <strong className="text-ink">connected wallet</strong>,
                not this vault
              </li>
              <li>• Available everywhere — Send, Payroll, Recurring</li>
              <li>• Adding here doesn't share the contact with other members</li>
              <li>• Saving from a Send modal also lands here</li>
            </ul>
          </div>
        </div>
      </div>

      <NewContactModal
        open={isAdding}
        onClose={() => setIsAdding(false)}
        onCreate={async (input) => {
          await create(input);
        }}
        creating={creating}
      />

      <ConfirmModal
        open={!!deleteId}
        title="Delete contact"
        description={
          entryToDelete
            ? `Remove "${entryToDelete.label}" (${abbrev(entryToDelete.address)}) from your address book? This cannot be undone.`
            : "Remove this contact from your address book? This cannot be undone."
        }
        confirmText="Delete"
        confirmVariant="destructive"
        cancelText="Cancel"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteId(null)}
        isLoading={removing}
      />
    </WorkspacePage>
  );
}

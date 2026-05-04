"use client";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Skeleton } from "@/components/ui/skeleton";
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
import { BookUser, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function abbrev(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
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

/* ── New contact inline form ── */
function NewContactForm({
  onCreate,
  onCancel,
  creating,
}: {
  onCreate: (input: { label: string; address: string; notes?: string }) => Promise<unknown>;
  onCancel: () => void;
  creating: boolean;
}) {
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => labelRef.current?.focus(), 0);
  }, []);

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
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact.");
    }
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft/30 p-4 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
          <BookUser className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label
              htmlFor="ab-new-label"
              className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
            >
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
              placeholder="e.g. Treasury, Alice"
              className={cn(
                "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              )}
            />
          </div>
          <div>
            <label
              htmlFor="ab-new-address"
              className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
            >
              Address
            </label>
            <input
              id="ab-new-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              maxLength={44}
              placeholder="Solana wallet address"
              spellCheck={false}
              className={cn(
                "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono text-ink",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              )}
            />
          </div>
          <div>
            <label
              htmlFor="ab-new-notes"
              className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
            >
              Notes
            </label>
            <input
              id="ab-new-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              maxLength={280}
              placeholder="Optional note"
              className={cn(
                "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              )}
            />
          </div>
          {error ? <p className="text-xs text-signal-danger">{error}</p> : null}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="default"
              onClick={() => void handleSubmit()}
              disabled={creating || !label.trim() || !address.trim()}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={creating}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Inline editable row ── */
function ContactRow({
  entry,
  onUpdate,
  onDelete,
  updating,
  removing,
}: {
  entry: AddressBookEntry;
  onUpdate: (id: string, patch: { label?: string; notes?: string | null }) => Promise<void>;
  onDelete: (id: string) => void;
  updating: boolean;
  removing: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(entry.label);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setTimeout(() => labelRef.current?.focus(), 0);
    }
  }, [isEditing]);

  const handleSave = useCallback(async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    const patch: { label?: string; notes?: string | null } = {};
    if (trimmedLabel !== entry.label) patch.label = trimmedLabel;
    const nextNotes = notes.trim() || null;
    if (nextNotes !== entry.notes) patch.notes = nextNotes;
    if (Object.keys(patch).length > 0) {
      await onUpdate(entry.id, patch);
    }
    setIsEditing(false);
  }, [label, notes, entry, onUpdate]);

  const handleCancel = useCallback(() => {
    setLabel(entry.label);
    setNotes(entry.notes ?? "");
    setIsEditing(false);
  }, [entry]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        void handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  if (isEditing) {
    return (
      <div className="rounded-lg border border-accent/30 bg-accent-soft/30 p-4 transition-colors">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
            <BookUser className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <label
                htmlFor={`ab-label-${entry.id}`}
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
              >
                Label
              </label>
              <input
                id={`ab-label-${entry.id}`}
                ref={labelRef}
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={64}
                className={cn(
                  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                )}
              />
            </div>
            <div>
              <label
                htmlFor={`ab-notes-${entry.id}`}
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
              >
                Notes
              </label>
              <input
                id={`ab-notes-${entry.id}`}
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={280}
                placeholder="Optional note about this contact"
                className={cn(
                  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                )}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="default"
                onClick={() => void handleSave()}
                disabled={updating || !label.trim()}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={updating}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-transparent p-4 transition-colors",
        "hover:border-border hover:bg-surface-2/50",
        removing && "opacity-50",
      )}
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-subtle group-hover:text-accent transition-colors">
        <BookUser className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{entry.label}</span>
          {entry.notes ? (
            <span className="hidden truncate text-xs text-ink-subtle sm:inline">
              — {entry.notes}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 font-mono text-xs text-ink-muted">{abbrev(entry.address)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
          aria-label="Edit contact"
          title="Edit contact"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-signal-danger/15 hover:text-signal-danger transition-colors"
          aria-label="Delete contact"
          title="Delete contact"
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
  const [isAdding, setIsAdding] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.address.toLowerCase().includes(q),
    );
  }, [entries, search]);

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
  }, [deleteId, remove]);

  const entryToDelete = useMemo(() => entries.find((e) => e.id === deleteId), [entries, deleteId]);

  return (
    <WorkspacePage>
      <div className="space-y-6">
        <WorkspaceHeader
          eyebrow="ADDRESS BOOK"
          title="Contacts"
          description="Manage your saved wallet addresses. These contacts are available across all your vaults for quick recipient selection."
          action={
            <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted">
              <BookUser className="h-3.5 w-3.5" />
              {entries.length} contact{entries.length !== 1 ? "s" : ""}
            </div>
          }
        />

        {isError && error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}

        <Panel>
          <PanelHeader
            icon={BookUser}
            title="Saved contacts"
            description="Click a contact to edit inline. Hover to reveal delete."
            action={
              <div className="flex items-center gap-2">
                {!isAdding && (
                  <Button size="sm" variant="accent-soft" onClick={() => setIsAdding(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add contact
                  </Button>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <input
                    type="text"
                    placeholder="Search contacts…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={cn(
                      "h-9 w-40 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-ink",
                      "placeholder:text-ink-subtle",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                      "md:w-56",
                    )}
                  />
                </div>
              </div>
            }
          />
          <PanelBody>
            {isAdding && (
              <div className="mb-3">
                <NewContactForm
                  onCreate={create}
                  onCancel={() => setIsAdding(false)}
                  creating={creating}
                />
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-[72px] w-full" />
                <Skeleton className="h-[72px] w-full" />
                <Skeleton className="h-[72px] w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-bg/30 px-4 py-10 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-subtle">
                  <BookUser className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">
                  {search.trim() ? "No matches" : "No contacts yet"}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
                  {search.trim()
                    ? "Try a different search term."
                    : "Add contacts manually or save them when sending funds to quickly autofill recipient addresses."}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((entry) => (
                  <ContactRow
                    key={entry.id}
                    entry={entry}
                    onUpdate={handleUpdate}
                    onDelete={setDeleteId}
                    updating={updating}
                    removing={removing}
                  />
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>

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

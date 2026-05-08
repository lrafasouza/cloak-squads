"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import {
  EmptyPanel,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { SendModal } from "@/components/vault/SendModal";
import { useVaultData } from "@/lib/use-vault-data";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
import { PublicKey } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import {
  ArrowUpFromLine,
  Check,
  Copy,
  Crown,
  Loader2,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

type SubVault = {
  id: string;
  cofreAddress: string;
  vaultIndex: number;
  name: string;
  color: string | null;
  icon: string | null;
};

function deriveVaultPda(multisigAddress: string, index: number): string {
  try {
    const multisigPk = new PublicKey(multisigAddress);
    const [pda] = multisigSdk.getVaultPda({ multisigPda: multisigPk, index });
    return pda.toBase58();
  } catch {
    return "–";
  }
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-ink"
      aria-label={label ?? "Copy address"}
    >
      {copied ? <Check className="h-3 w-3 text-signal-positive" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/* ── Treasury allocation bar ────────────────────────────────────────────
   Stacked horizontal bar showing how the total balance is split across
   accounts. Reads as a single material — no gaps, segment widths are
   exact percentages. The first segment uses --accent (Primary stays
   gold); subsequent accounts step through brass→border tones so the
   eye reads importance left-to-right. */
type AllocationSegment = {
  key: string;
  name: string;
  lamports: number;
  tone: AllocationTone;
};

function AllocationBar({
  segments,
  totalLamports,
}: {
  segments: AllocationSegment[];
  totalLamports: number;
}) {
  if (totalLamports === 0) {
    return (
      <div className="flex h-2 items-center gap-1 rounded-full bg-surface-2">
        <div className="h-full w-full rounded-full bg-surface-3" />
      </div>
    );
  }
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
      {segments.map((s) => {
        const pct = (s.lamports / totalLamports) * 100;
        if (pct < 0.4) return null;
        return (
          <div
            key={s.key}
            className={cn("h-full transition-aegis", s.tone.bg)}
            style={{ width: `${pct}%` }}
            title={`${s.name} · ${pct.toFixed(1)}%`}
          />
        );
      })}
    </div>
  );
}

/* Allocation palette — full-opacity, visually distinct hues so the
   stacked bar reads as multi-segment (no two adjacent tones share a
   family). Each entry gives us bg/dot/ring/text variants so the same
   colour can mark the bar segment, the legend dot, and the row swatch
   without redefining the mapping. Primary always claims `accent` (the
   brand gold) — sub-vaults rotate through the rest. */
type AllocationTone = {
  bg: string;
  dot: string;
  ring: string;
};

const ALLOCATION_TONES: AllocationTone[] = [
  // Primary — burnished gold (brand). Full opacity, always slot 0.
  { bg: "bg-accent", dot: "bg-accent", ring: "ring-accent/40" },
  // Emerald — distinct hue from gold; separates Primary visually
  { bg: "bg-signal-positive", dot: "bg-signal-positive", ring: "ring-signal-positive/40" },
  // Amber — warm but desaturated against gold
  { bg: "bg-signal-warn", dot: "bg-signal-warn", ring: "ring-signal-warn/40" },
  // Garnet — red signal hue, distinct from amber
  { bg: "bg-signal-danger", dot: "bg-signal-danger", ring: "ring-signal-danger/40" },
  // Brass — only after 3 non-gold separators so it reads as its own slot
  { bg: "bg-brass", dot: "bg-brass", ring: "ring-brass/40" },
  // Warm-gold variant — closes the cycle, distant from accent on either side
  { bg: "bg-accent-hover", dot: "bg-accent-hover", ring: "ring-accent-hover/40" },
];

const FALLBACK_TONE: AllocationTone = {
  bg: "bg-accent",
  dot: "bg-accent",
  ring: "ring-accent/40",
};

function toneForIndex(i: number): AllocationTone {
  return ALLOCATION_TONES[i % ALLOCATION_TONES.length] ?? FALLBACK_TONE;
}

/* ── Account row ────────────────────────────────────────────────────────
   Pinned identicon, name + role pill, address with copy, balance ledger,
   inline send/remove actions. Hover reveals soft surface and lifts the
   border. Default account is non-removable; subsequent accounts get the
   trash affordance. */
function AccountRow({
  name,
  address,
  isDefault,
  balanceSol,
  share,
  tone,
  onDelete,
  onSend,
  isSelected,
  onSelect,
}: {
  name: string;
  address: string;
  isDefault?: boolean;
  balanceSol?: string;
  share?: number;
  tone: AllocationTone;
  onDelete?: () => void;
  onSend?: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  const short = address !== "–" ? `${address.slice(0, 14)}…${address.slice(-8)}` : "–";
  const balNum = balanceSol !== undefined ? Number.parseFloat(balanceSol) : 0;
  const hasFunds = balNum > 0;

  return (
    // biome-ignore lint/a11y/useSemanticElements: native <button> can't host the absolute action buttons inside
    <div
      role="button"
      tabIndex={onSelect ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (!onSelect) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Select ${name}`}
      aria-pressed={isSelected}
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 transition-aegis",
        "cursor-pointer hover:bg-surface-2/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
        isSelected && "bg-surface-2/80",
      )}
    >
      {/* Tone rail — always-on coloured edge that ties the row to its
          allocation-bar segment. Selected state thickens it to brass. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-2 left-0 rounded-r-full transition-aegis",
          isSelected ? "w-[3px] bg-brass" : "w-[2px]",
          !isSelected && tone.bg,
        )}
      />

      {/* Identicon — uses the vault PDA for stable hash; falls back to name.
          Ring-coloured to echo the allocation tone. */}
      <div
        className={cn(
          "relative z-10 shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-2 transition-aegis",
          tone.ring,
        )}
      >
        {address !== "–" ? (
          <VaultIdenticon seed={address} size={40} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center text-ink-subtle">
            <Wallet className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)}
            title="Allocation colour"
          />
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          {isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-eyebrow text-accent">
              <Crown className="h-2.5 w-2.5" aria-hidden="true" />
              Primary
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="font-mono text-[11px] text-ink-subtle">{short}</p>
          {address !== "–" && <CopyButton text={address} label={`Copy ${name} address`} />}
        </div>
      </div>

      {/* Balance ledger — right-aligned, tabular nums */}
      <div className="relative z-10 hidden text-right sm:block">
        <p
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            hasFunds ? "text-ink" : "text-ink-subtle/50",
          )}
        >
          {hasFunds ? balNum.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "0"}
          <span className="ml-1 text-xs font-normal text-ink-subtle">SOL</span>
        </p>
        {share !== undefined && hasFunds && (
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-ink-subtle">
            {share.toFixed(1)}% of treasury
          </p>
        )}
      </div>

      {/* Action affordances — revealed on hover or when selected */}
      <div
        className={cn(
          "relative z-10 flex shrink-0 items-center gap-1 transition-opacity",
          "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          isSelected && "sm:opacity-100",
        )}
      >
        {onSend && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSend();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-accent-soft hover:text-accent"
            aria-label={`Send from ${name}`}
            title="Send from this account"
          >
            <ArrowUpFromLine className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-signal-danger/15 hover:text-signal-danger"
            aria-label={`Remove ${name}`}
            title="Remove label"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function SubVaultsPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { fetchWithAuth } = useWalletAuth();
  const { addToast } = useToast();
  const { data: vaultData } = useVaultData(multisig);

  const [subVaults, setSubVaults] = useState<SubVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (addModalOpen) setTimeout(() => newNameRef.current?.focus(), 0);
  }, [addModalOpen]);
  const [sendVaultIndex, setSendVaultIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vaults/${multisig}/sub-vaults`);
      if (res.ok) setSubVaults(await res.json());
    } finally {
      setLoading(false);
    }
  }, [multisig]);

  useEffect(() => {
    load();
  }, [load]);

  const nextIndex =
    subVaults.length > 0 ? Math.max(...subVaults.map((sv) => sv.vaultIndex)) + 1 : 1;

  const previewAddress = deriveVaultPda(multisig, nextIndex);

  const primaryAddress = deriveVaultPda(multisig, 0);
  const primaryBalSol = vaultData?.primaryBalanceSol ?? "0";

  /* Aggregates — segments + tones in one pass. The Primary segment
     always claims slot 0 of the palette (gold); sub-vaults rotate
     through the rest in vaultIndex order so the colour for "Treasury"
     stays "Treasury" across renders. */
  const aggregates = useMemo(() => {
    const primaryLamports = Math.round(Number.parseFloat(primaryBalSol) * 1e9);
    const sortedSubs = [...subVaults].sort((a, b) => a.vaultIndex - b.vaultIndex);
    const subSegments: AllocationSegment[] = sortedSubs.map((sv, i) => {
      const breakdown = vaultData?.subVaultBreakdown.find((b) => b.vaultIndex === sv.vaultIndex);
      const lamports = breakdown ? Math.round(Number.parseFloat(breakdown.balanceSol) * 1e9) : 0;
      return {
        key: `sv-${sv.vaultIndex}`,
        name: sv.name,
        lamports,
        tone: toneForIndex(i + 1),
      };
    });
    const totalLamports = primaryLamports + subSegments.reduce((a, s) => a + s.lamports, 0);
    const segments: AllocationSegment[] = [
      {
        key: "primary",
        name: "Primary",
        lamports: primaryLamports,
        tone: toneForIndex(0),
      },
      ...subSegments,
    ];
    const totalSol = totalLamports / 1e9;
    const accountCount = 1 + subVaults.length;
    const fundedCount =
      (primaryLamports > 0 ? 1 : 0) + subSegments.filter((s) => s.lamports > 0).length;
    const primaryShare = totalLamports > 0 ? (primaryLamports / totalLamports) * 100 : 100;

    /* Tone lookup for the AccountRow list — keyed by vaultIndex so the
       row pulls the same tone its bar segment uses. */
    const toneByVaultIndex = new Map<number, AllocationTone>();
    toneByVaultIndex.set(0, toneForIndex(0));
    sortedSubs.forEach((sv, i) => {
      toneByVaultIndex.set(sv.vaultIndex, toneForIndex(i + 1));
    });

    return {
      totalLamports,
      totalSol,
      segments,
      accountCount,
      fundedCount,
      primaryShare,
      primaryLamports,
      toneByVaultIndex,
    };
  }, [primaryBalSol, subVaults, vaultData?.subVaultBreakdown]);

  const openAddModal = () => {
    setNewName("");
    setCreateError(null);
    setAddModalOpen(true);
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError("Enter a name for the account.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetchWithAuth(`/api/vaults/${multisig}/sub-vaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultIndex: nextIndex, name: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to create account.");
      }
      addToast("Account created.", "success");
      setNewName("");
      setAddModalOpen(false);
      await load();
      setSelectedIndex(nextIndex);
    } catch (err) {
      setCreateError(String(err instanceof Error ? err.message : err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (vaultIndex: number, name: string) => {
    const breakdown = vaultData?.subVaultBreakdown.find((b) => b.vaultIndex === vaultIndex);
    const bal = Number.parseFloat(breakdown?.balanceSol ?? "0");
    if (bal > 0) {
      addToast(
        `"${name}" holds ${bal.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL. Send funds to another account first, then remove the label.`,
        "error",
      );
      return;
    }
    if (!confirm(`Remove "${name}"? This only deletes the label, on-chain funds are unaffected.`))
      return;
    try {
      const res = await fetchWithAuth(`/api/vaults/${multisig}/sub-vaults/${vaultIndex}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to remove.");
      }
      addToast("Account removed.", "success");
      await load();
      if (selectedIndex === vaultIndex) setSelectedIndex(0);
    } catch (err) {
      addToast(String(err instanceof Error ? err.message : err), "error");
    }
  };

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Treasury · Accounts"
        title="Accounts"
        description="Each account is a separate on-chain address derived from your multisig. Label and fund them independently to keep treasury, grants, or operations on their own ledger."
        action={
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-accent-hover px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow"
          >
            <Plus className="h-4 w-4" />
            New account
          </button>
        }
      />

      {/* ── Treasury hero ──
          Single anchor card per page (per design rulebook). Total balance
          on the left + stacked allocation bar + funded/total summary on
          the right. The .card-hero archetype gives us the embossed inset
          highlight and deeper drop shadow. */}
      <div className="card-hero mb-6 overflow-hidden p-6 md:p-7">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-eyebrow">Treasury split</p>
            <p className="mt-1.5 font-display text-4xl font-semibold leading-none tracking-tight text-ink md:text-5xl">
              {aggregates.totalSol.toLocaleString("en-US", {
                maximumFractionDigits: 4,
              })}
              <span className="ml-2 font-sans text-base font-medium text-ink-subtle md:text-lg">
                SOL
              </span>
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Across {aggregates.accountCount}{" "}
              {aggregates.accountCount === 1 ? "account" : "accounts"} · {aggregates.fundedCount}{" "}
              funded ·{" "}
              <span className="text-ink">{aggregates.primaryShare.toFixed(1)}% in Primary</span>
            </p>
          </div>

          {/* Right shoulder — segment legend (lg+ only). Echoes the bar. */}
          <div className="hidden gap-5 md:flex md:flex-wrap md:justify-end">
            {aggregates.segments.slice(0, 4).map((s) => {
              const pct =
                aggregates.totalLamports > 0 ? (s.lamports / aggregates.totalLamports) * 100 : 0;
              return (
                <div key={s.key} className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", s.tone.dot)}
                      aria-hidden="true"
                    />
                    <span className="text-eyebrow">{s.name}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
                    {pct.toFixed(1)}%
                  </p>
                </div>
              );
            })}
            {aggregates.segments.length > 4 && (
              <div className="text-right">
                <p className="text-eyebrow">+{aggregates.segments.length - 4}</p>
                <p className="mt-0.5 font-mono text-sm tabular-nums text-ink-subtle">more</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5">
          <AllocationBar segments={aggregates.segments} totalLamports={aggregates.totalLamports} />
        </div>
      </div>

      {/* ── Master / detail ──
          List on the left (50%), inspector or create-form panel on the
          right (sticky). Same vocabulary as /operator. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — accounts list */}
        <div className="card-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div>
              <p className="text-eyebrow">Ledger · {aggregates.accountCount} accounts</p>
              <h2 className="mt-0.5 font-display text-lg font-semibold tracking-tight text-ink">
                On-chain addresses
              </h2>
            </div>
            <span className="text-eyebrow hidden sm:inline">Click to inspect</span>
          </div>

          <div className="divide-y divide-border/40">
            {/* Primary always pinned at top */}
            <AccountRow
              name="Primary"
              address={primaryAddress}
              isDefault
              balanceSol={primaryBalSol}
              share={aggregates.primaryShare}
              tone={aggregates.toneByVaultIndex.get(0) ?? toneForIndex(0)}
              onSend={() => setSendVaultIndex(0)}
              isSelected={selectedIndex === 0}
              onSelect={() => setSelectedIndex(0)}
            />

            {loading ? (
              <div className="px-5 py-4">
                <p className="animate-pulse text-xs text-ink-subtle">Loading accounts…</p>
              </div>
            ) : subVaults.length === 0 ? (
              <div className="px-5 py-10">
                <EmptyPanel
                  title="No additional accounts"
                  description="Add an account to separate your funds — for example a dedicated treasury, grants pot, or ops balance."
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={openAddModal}
                      className="border border-dashed border-border"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add account
                    </Button>
                  }
                />
              </div>
            ) : (
              subVaults.map((sv) => {
                const breakdown = vaultData?.subVaultBreakdown.find(
                  (b) => b.vaultIndex === sv.vaultIndex,
                );
                const balLamports = breakdown
                  ? Math.round(Number.parseFloat(breakdown.balanceSol) * 1e9)
                  : 0;
                const share =
                  aggregates.totalLamports > 0 ? (balLamports / aggregates.totalLamports) * 100 : 0;
                const rowTone = aggregates.toneByVaultIndex.get(sv.vaultIndex) ?? toneForIndex(0);
                return (
                  <AccountRow
                    key={sv.id}
                    name={sv.name}
                    address={deriveVaultPda(multisig, sv.vaultIndex)}
                    tone={rowTone}
                    onDelete={() => handleDelete(sv.vaultIndex, sv.name)}
                    onSend={() => setSendVaultIndex(sv.vaultIndex)}
                    isSelected={selectedIndex === sv.vaultIndex}
                    onSelect={() => setSelectedIndex(sv.vaultIndex)}
                    {...(breakdown ? { balanceSol: breakdown.balanceSol, share } : {})}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT — sticky inspector */}
        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Panel>
            <PanelHeader
              icon={Wallet}
              title="Selected account"
              description="Inspect or send from the highlighted row."
            />
            <PanelBody className="space-y-4">
              {(() => {
                const isPrimary = selectedIndex === 0;
                const sv = subVaults.find((x) => x.vaultIndex === selectedIndex);
                const name = isPrimary ? "Primary" : (sv?.name ?? "—");
                const addr = deriveVaultPda(multisig, selectedIndex);
                const balSol = isPrimary
                  ? primaryBalSol
                  : (vaultData?.subVaultBreakdown.find((b) => b.vaultIndex === selectedIndex)
                      ?.balanceSol ?? "0");
                const balNum = Number.parseFloat(balSol);
                const inspectorTone =
                  aggregates.toneByVaultIndex.get(selectedIndex) ?? toneForIndex(0);
                return (
                  <>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-2",
                          inspectorTone.ring,
                        )}
                      >
                        <VaultIdenticon seed={addr} size={48} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className={cn("h-2 w-2 shrink-0 rounded-full", inspectorTone.dot)}
                          />
                          <p className="truncate text-sm font-semibold text-ink">{name}</p>
                        </div>
                        <p className="font-mono text-[11px] text-ink-subtle">
                          #{selectedIndex} ·{" "}
                          {addr !== "–" ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : "–"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-list border border-border bg-bg/40 px-3 py-2.5">
                      <p className="text-eyebrow">Balance</p>
                      <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">
                        {balNum.toLocaleString("en-US", { maximumFractionDigits: 4 })}{" "}
                        <span className="text-xs font-normal text-ink-subtle">SOL</span>
                      </p>
                    </div>

                    <div className="space-y-1 rounded-list border border-border bg-bg/40 px-3 py-2">
                      <p className="text-eyebrow">Address</p>
                      <div className="flex items-center gap-1.5">
                        <p className="break-all font-mono text-[11px] leading-relaxed text-ink">
                          {addr}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <CopyButton text={addr} />
                        <span className="text-[10px] text-ink-subtle">Copy to deposit funds.</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => setSendVaultIndex(selectedIndex)}
                      disabled={balNum === 0}
                    >
                      <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
                      {balNum === 0 ? "Empty — fund first" : `Send from ${name}`}
                    </Button>
                  </>
                );
              })()}
            </PanelBody>
          </Panel>

          <div className="card-panel space-y-2 px-4 py-3">
            <p className="text-eyebrow">How accounts work</p>
            <ul className="space-y-1.5 text-[11px] leading-relaxed text-ink-muted">
              <li>
                • Sub-accounts share this vault's{" "}
                <strong className="text-ink">signers and threshold</strong>
              </li>
              <li>• Each gets a unique on-chain address — fund it directly</li>
              <li>• You manage everything from this vault, no switching</li>
              <li>• Names are off-chain labels; deleting one preserves funds</li>
            </ul>
          </div>
        </div>
      </div>

      <SendModal
        multisig={multisig}
        open={sendVaultIndex !== null}
        onOpenChange={(v) => {
          if (!v) setSendVaultIndex(null);
        }}
        defaultVaultIndex={sendVaultIndex ?? 0}
        subVaultAccounts={subVaults.map((sv) => ({ vaultIndex: sv.vaultIndex, name: sv.name }))}
      />

      {/* ── Add account modal ──
          Mirrors the AddMember modal pattern in /members: gold seal across
          the top, eyebrow + display title, name input, live address preview
          for the next-derived PDA, Cancel/Create actions. */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating) setAddModalOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !creating) setAddModalOpen(false);
          }}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: <dialog> element doesn't fit the heraldic frame; manual a11y via role+aria-modal */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-title"
            className="relative w-full max-w-md overflow-hidden rounded-modal border border-border bg-surface p-6 shadow-raise-2"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent/0 via-accent to-accent/0"
            />
            <p className="text-eyebrow">Treasury · New account</p>
            <h3
              id="add-account-title"
              className="mt-0.5 font-display text-xl font-semibold tracking-tight text-ink"
            >
              Open a new account
            </h3>
            <p className="mt-1.5 text-sm text-ink-muted">
              Each account is a separate on-chain address derived from this vault. Funds, signers,
              and threshold stay shared.
            </p>

            <label htmlFor="add-account-name" className="mt-5 block text-eyebrow">
              Account name
            </label>
            <input
              id="add-account-name"
              ref={newNameRef}
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim() && !creating) handleCreate();
              }}
              maxLength={64}
              placeholder="Treasury, Grants, Ops…"
              className="mt-1.5 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder-ink-subtle focus:border-accent focus:outline-none"
            />

            {previewAddress !== "–" && (
              <div className="mt-4 rounded-list border border-border bg-bg/40 px-3 py-2.5">
                <p className="text-eyebrow">Address preview · #{nextIndex}</p>
                <div className="mt-1 flex items-center gap-3">
                  <div className="shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2">
                    <VaultIdenticon seed={previewAddress} size={40} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {newName.trim() || <span className="text-ink-subtle">Account name</span>}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="font-mono text-[11px] text-ink-subtle">
                        {previewAddress.slice(0, 14)}…{previewAddress.slice(-8)}
                      </p>
                      <CopyButton text={previewAddress} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {createError && <p className="mt-3 text-xs text-signal-danger">{createError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddModalOpen(false);
                  setNewName("");
                  setCreateError(null);
                }}
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-accent-hover px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {creating ? "Creating…" : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}

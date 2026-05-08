"use client";

import { ConfirmModal } from "@/components/ui/confirm-modal";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import {
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { findEntryByAddress, useAddressBook } from "@/lib/hooks/useAddressBook";
import { createAddMemberProposal, createRemoveMemberProposal } from "@/lib/squads-sdk";
import { proposalSummariesQueryKey, useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { cn } from "@/lib/utils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Key,
  Loader2,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { use, useMemo, useRef, useState } from "react";

/* ── Threshold gauge ────────────────────────────────────────────────────
   Visual reading of T-of-N: N concentric pips around an arc, T of which
   are filled in brass. Reads at a glance — "are we at quorum, half, full?"
   Sized to sit in the hero shoulder. */
function ThresholdGauge({
  threshold,
  total,
  size = 100,
}: {
  threshold: number;
  total: number;
  size?: number;
}) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = total > 0 ? (threshold / total) * circumference : 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <title>{`${threshold} of ${total} signatures required`}</title>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={stroke}
        />
        {/* Filled arc — sweeps from 12 o'clock */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={circumference / 4}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-semibold tabular-nums text-ink">
          {threshold}
          <span className="text-base font-normal text-ink-subtle">/{total}</span>
        </span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-eyebrow text-ink-subtle">
          Quorum
        </span>
      </div>
    </div>
  );
}

/* ── Member row ─────────────────────────────────────────────────────────
   Identicon + label-or-address + role pill + inline icon actions. The
   connected member gets a brass active rail; selectable for the right-rail
   inspector. */
function MemberRow({
  index,
  address,
  isMe,
  isOnly,
  contactLabel,
  isSelected,
  onSelect,
  onCopy,
  onRemove,
}: {
  index: number;
  address: string;
  isMe: boolean;
  isOnly: boolean;
  contactLabel: string | null;
  isSelected: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const short = `${address.slice(0, 8)}…${address.slice(-6)}`;

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
      aria-label={`Inspect member ${contactLabel ?? short}`}
      aria-pressed={isSelected}
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 transition-aegis",
        "cursor-pointer hover:bg-surface-2/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
        isSelected && "bg-surface-2/80",
      )}
    >
      {/* Brass rail — selected state */}
      {isSelected && (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brass"
        />
      )}

      <span className="relative z-10 w-6 shrink-0 text-right font-mono text-xs text-ink-subtle">
        {index + 1}
      </span>

      <div className="relative z-10 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2">
        <VaultIdenticon seed={address} size={36} />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{contactLabel ?? short}</p>
          {isMe && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-eyebrow text-accent">
              <Key className="h-2.5 w-2.5" aria-hidden="true" />
              You
            </span>
          )}
        </div>
        {contactLabel && <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">{short}</p>}
      </div>

      <div className="relative z-10 hidden shrink-0 sm:block">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
          <Shield className="h-2.5 w-2.5" aria-hidden="true" />
          Signer
        </span>
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
        <a
          href={`https://solana.fm/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-ink"
          aria-label="View on SolanaFM"
          title="View on SolanaFM"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {!isOnly && !isMe && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle transition-aegis hover:bg-signal-danger/15 hover:text-signal-danger"
            aria-label="Propose removal"
            title="Propose removal"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MembersPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { data, isLoading, error } = useVaultData(multisig);
  const { data: proposals = [] } = useProposalSummaries(multisig);
  const { entries: contacts } = useAddressBook();
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addAddress, setAddAddress] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const [selectedAddr, setSelectedAddr] = useState<string | null>(null);

  const submittingRef = useRef(false);

  const multisigPda = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const pendingMemberProposals = useMemo(
    () =>
      proposals.filter(
        (p) =>
          p.status === "active" &&
          (p.memo?.toLowerCase().includes("member") || p.memo?.toLowerCase().includes("threshold")),
      ),
    [proposals],
  );

  /* When data lands, default the inspector to the connected member if
     present, else the first member. */
  const effectiveSelected = useMemo(() => {
    if (!data) return null;
    if (selectedAddr && data.members.includes(selectedAddr)) return selectedAddr;
    const me = wallet.publicKey?.toBase58();
    if (me && data.members.includes(me)) return me;
    return data.members[0] ?? null;
  }, [data, selectedAddr, wallet.publicKey]);

  async function handleAddMember() {
    if (submittingRef.current || !wallet.publicKey || !multisigPda || !wallet.sendTransaction)
      return;
    setAddError(null);
    let newMemberPk: PublicKey;
    try {
      newMemberPk = new PublicKey(addAddress.trim());
    } catch {
      setAddError("Invalid Solana address");
      return;
    }
    if (data?.members.includes(newMemberPk.toBase58())) {
      setAddError("This address is already a member");
      return;
    }
    submittingRef.current = true;
    setAddLoading(true);
    try {
      await createAddMemberProposal({
        connection,
        wallet: { publicKey: wallet.publicKey, sendTransaction: wallet.sendTransaction },
        multisigPda,
        newMember: newMemberPk,
        memo: `Add member ${newMemberPk.toBase58().slice(0, 8)}…`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) }),
        queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] }),
      ]);
      setAddModalOpen(false);
      setAddAddress("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create proposal");
    } finally {
      setAddLoading(false);
      submittingRef.current = false;
    }
  }

  async function handleRemoveMember() {
    if (
      submittingRef.current ||
      !wallet.publicKey ||
      !multisigPda ||
      !wallet.sendTransaction ||
      !removeTarget ||
      !data
    )
      return;
    submittingRef.current = true;
    setRemoveLoading(true);
    try {
      const newMemberCount = data.memberCount - 1;
      const needsThresholdChange = data.threshold > newMemberCount;
      const newThreshold = needsThresholdChange ? Math.max(1, newMemberCount) : null;
      await createRemoveMemberProposal({
        connection,
        wallet: { publicKey: wallet.publicKey, sendTransaction: wallet.sendTransaction },
        multisigPda,
        memberToRemove: new PublicKey(removeTarget),
        ...(newThreshold !== null ? { newThreshold } : {}),
        memo:
          newThreshold !== null
            ? `Remove member ${removeTarget.slice(0, 8)}… and lower threshold to ${newThreshold}`
            : `Remove member ${removeTarget.slice(0, 8)}…`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) }),
        queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] }),
      ]);
      setRemoveTarget(null);
    } catch (err) {
      console.error(err);
    } finally {
      setRemoveLoading(false);
      submittingRef.current = false;
    }
  }

  if (isLoading) {
    return (
      <WorkspacePage>
        <div className="flex items-center justify-center p-12 text-ink-muted">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading members…
        </div>
      </WorkspacePage>
    );
  }

  if (error || !data) {
    return (
      <WorkspacePage>
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <AlertTriangle className="h-8 w-8 text-signal-warn" />
          <h2 className="mt-3 text-sm font-semibold text-ink">Failed to load members</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Check the vault address and network connection.
          </p>
        </div>
      </WorkspacePage>
    );
  }

  const me = wallet.publicKey?.toBase58();
  const selectedContact = effectiveSelected
    ? (findEntryByAddress(contacts, effectiveSelected)?.label ?? null)
    : null;

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Vault · Signers"
        title="Members"
        description={`${data.memberCount} ${data.memberCount === 1 ? "signer holds" : "signers hold"} keys to this vault. ${data.threshold} of ${data.memberCount} signature${data.threshold === 1 ? "" : "s"} required to move funds.`}
        action={
          <button
            type="button"
            onClick={() => {
              setAddAddress("");
              setAddError(null);
              setAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-accent-hover px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow"
          >
            <UserPlus className="h-4 w-4" />
            Add member
          </button>
        }
      />

      {/* ── Hero · Threshold gauge + KPIs ── */}
      <div className="card-hero mb-6 overflow-hidden p-6 md:p-7">
        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          <ThresholdGauge threshold={data.threshold} total={data.memberCount} size={120} />
          <div>
            <p className="text-eyebrow">Quorum policy</p>
            <p className="mt-1 font-display text-2xl font-semibold leading-tight tracking-tight text-ink md:text-3xl">
              {data.threshold} of {data.memberCount} signers required
            </p>
            <p className="mt-2 max-w-xl text-sm text-ink-muted">
              {data.threshold === data.memberCount
                ? "Unanimous consent — every signer must approve before a transaction executes."
                : data.threshold === 1
                  ? "Single-signer policy — any one member can move funds. Consider raising the threshold for production vaults."
                  : `Majority control — any ${data.threshold} of ${data.memberCount} can approve. Below the threshold, proposals stay pending.`}
            </p>

            {/* KPI strip — terse, three numbers */}
            <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border/50 pt-4 sm:max-w-md">
              <div>
                <div className="flex items-center gap-1.5 text-eyebrow">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  Members
                </div>
                <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink">
                  {data.memberCount}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-eyebrow">
                  <Shield className="h-3 w-3" aria-hidden="true" />
                  Threshold
                </div>
                <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink">
                  {data.threshold}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-eyebrow">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Pending
                </div>
                <p
                  className={cn(
                    "mt-1 font-display text-xl font-semibold tabular-nums",
                    pendingMemberProposals.length > 0 ? "text-signal-warn" : "text-ink",
                  )}
                >
                  {pendingMemberProposals.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pendingMemberProposals.length > 0 && (
        <div className="mb-6">
          <InlineAlert tone="warning">
            <div className="flex flex-1 items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">Pending member change</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {pendingMemberProposals.length} config proposal
                  {pendingMemberProposals.length === 1 ? "" : "s"} await
                  {pendingMemberProposals.length === 1 ? "s" : ""} signature.
                </p>
              </div>
              <Link
                href={`/vault/${multisig}/proposals`}
                className="shrink-0 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:bg-accent-hover hover:shadow-accent-glow"
              >
                Open proposals
              </Link>
            </div>
          </InlineAlert>
        </div>
      )}

      {/* ── Master / detail ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — members ledger */}
        <div className="card-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div>
              <p className="text-eyebrow">Roster · {data.memberCount} signers</p>
              <h2 className="mt-0.5 font-display text-lg font-semibold tracking-tight text-ink">
                Authorized keys
              </h2>
            </div>
            <span className="text-eyebrow hidden sm:inline">Click to inspect</span>
          </div>

          <div className="divide-y divide-border/40">
            {data.members.map((addr, i) => {
              const isMe = addr === me;
              const contactLabel = findEntryByAddress(contacts, addr)?.label ?? null;
              return (
                <MemberRow
                  key={addr}
                  index={i}
                  address={addr}
                  isMe={isMe}
                  isOnly={data.memberCount <= 1}
                  contactLabel={contactLabel}
                  isSelected={effectiveSelected === addr}
                  onSelect={() => setSelectedAddr(addr)}
                  onCopy={() => navigator.clipboard.writeText(addr)}
                  onRemove={() => setRemoveTarget(addr)}
                />
              );
            })}
          </div>
        </div>

        {/* RIGHT — sticky inspector */}
        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Panel>
            <PanelHeader
              icon={Key}
              title="Selected signer"
              description="Identity, label, and removal action."
            />
            <PanelBody className="space-y-4">
              {effectiveSelected ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 overflow-hidden rounded-lg border border-border/70 bg-surface-2">
                      <VaultIdenticon seed={effectiveSelected} size={48} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {selectedContact ??
                          `${effectiveSelected.slice(0, 8)}…${effectiveSelected.slice(-6)}`}
                      </p>
                      <p className="font-mono text-[11px] text-ink-subtle">Member · Signer</p>
                    </div>
                  </div>

                  <div className="space-y-1 rounded-list border border-border bg-bg/40 px-3 py-2">
                    <p className="text-eyebrow">Public key</p>
                    <p className="break-all font-mono text-[11px] leading-relaxed text-ink">
                      {effectiveSelected}
                    </p>
                  </div>

                  <div className="rounded-list border border-border bg-bg/40 px-3 py-2.5">
                    <p className="text-eyebrow">Signing power</p>
                    <p className="mt-0.5 text-sm text-ink">
                      Counts as <span className="font-semibold">1 of {data.threshold}</span>{" "}
                      required signatures.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(effectiveSelected)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </button>
                    <a
                      href={`https://solana.fm/address/${effectiveSelected}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Explorer
                    </a>
                  </div>

                  {data.memberCount > 1 && effectiveSelected !== me && (
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(effectiveSelected)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-signal-danger/30 bg-signal-danger/5 px-3 py-2 text-xs font-medium text-signal-danger transition-aegis hover:bg-signal-danger/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Propose removal
                    </button>
                  )}
                  {effectiveSelected === me && (
                    <p className="rounded-list border border-dashed border-border bg-bg/40 px-3 py-2 text-[11px] leading-relaxed text-ink-subtle">
                      You can't remove yourself. Another member must propose your removal.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-ink-subtle">Select a member to inspect.</p>
              )}
            </PanelBody>
          </Panel>

          <div className="card-panel space-y-2 px-4 py-3">
            <p className="text-eyebrow">How threshold works</p>
            <ul className="space-y-1.5 text-[11px] leading-relaxed text-ink-muted">
              <li>
                • Add or remove a signer by{" "}
                <strong className="text-ink">creating a config proposal</strong>
              </li>
              <li>
                • Removing a signer below the threshold{" "}
                <strong className="text-ink">auto-lowers the threshold</strong> in the same tx
              </li>
              <li>• Every existing member sees the proposal and must sign</li>
              <li>• Threshold = 1 means any single member can move funds (use cautiously)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Add Member modal ── */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md overflow-hidden rounded-modal border border-border bg-surface p-6 shadow-raise-2">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent/0 via-accent to-accent/0"
            />
            <p className="text-eyebrow">Add member · Config proposal</p>
            <h3 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-ink">
              Invite signer
            </h3>
            <p className="mt-1.5 text-sm text-ink-muted">
              Creates a Squads config proposal. Existing members must sign before the new key joins.
            </p>
            <label htmlFor="new-member-address" className="mt-5 block text-eyebrow">
              Member wallet address
            </label>
            <input
              id="new-member-address"
              type="text"
              value={addAddress}
              onChange={(e) => {
                setAddAddress(e.target.value);
                setAddError(null);
              }}
              placeholder="Solana public key"
              className="mt-1.5 w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm tabular-nums text-ink placeholder-ink-subtle focus:border-accent focus:outline-none"
            />
            {addError && <p className="mt-2 text-xs text-signal-danger">{addError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                disabled={addLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAddMember()}
                disabled={addLoading || !addAddress.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-accent-hover px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow disabled:opacity-50"
              >
                {addLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {addLoading ? "Creating…" : "Create proposal"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={removeTarget !== null}
        title="Remove member"
        description={(() => {
          const who = removeTarget ? `${removeTarget.slice(0, 8)}…` : "this member";
          if (!data) return `Propose removal of ${who}?`;
          const newCount = data.memberCount - 1;
          const willLower = data.threshold > newCount;
          const base = `Propose removal of ${who}? This creates a config proposal that all required members must sign.`;
          if (willLower) {
            const newThreshold = Math.max(1, newCount);
            return `${base} The threshold will also be lowered to ${newThreshold}/${newCount} so the vault remains valid after removal.`;
          }
          return base;
        })()}
        confirmText="Create removal proposal"
        confirmVariant="destructive"
        isLoading={removeLoading}
        onConfirm={() => void handleRemoveMember()}
        onCancel={() => {
          if (!removeLoading) setRemoveTarget(null);
        }}
      />
    </WorkspacePage>
  );
}

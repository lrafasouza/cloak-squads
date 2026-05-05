"use client";

import { AddressPill } from "@/components/ui/address-pill";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  InlineAlert,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import {
  createAddMemberProposal,
  createRemoveMemberProposal,
} from "@/lib/squads-sdk";
import { proposalSummariesQueryKey, useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useVaultData } from "@/lib/use-vault-data";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Copy, ExternalLink, Loader2, Shield, Trash2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useRef, useState } from "react";

export default function MembersPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);
  const { data, isLoading, error } = useVaultData(multisig);
  const { data: proposals = [] } = useProposalSummaries(multisig);
  const { connection } = useConnection();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addAddress, setAddAddress] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const submittingRef = useRef(false);

  const multisigPda = useMemo(() => {
    try { return new PublicKey(multisig); } catch { return null; }
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

  async function handleAddMember() {
    if (submittingRef.current || !wallet.publicKey || !multisigPda || !wallet.sendTransaction) return;
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
    if (submittingRef.current || !wallet.publicKey || !multisigPda || !wallet.sendTransaction || !removeTarget || !data) return;
    submittingRef.current = true;
    setRemoveLoading(true);
    try {
      const newMemberCount = data.memberCount - 1;
      // Squads rejects threshold > member count (InvalidThreshold). Lower it in the same tx.
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

  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="VAULT"
          title="Members"
          description={`${data.memberCount} members · ${data.threshold}/${data.memberCount} threshold required`}
          action={
            <button
              type="button"
              onClick={() => { setAddAddress(""); setAddError(null); setAddModalOpen(true); }}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover"
            >
              <UserPlus className="h-4 w-4" />
              Add Member
            </button>
          }
        />

        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-ink-subtle" />
            <span className="text-ink-muted">Members</span>
            <span className="font-semibold text-ink">{data.memberCount}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-ink-subtle" />
            <span className="text-ink-muted">Threshold</span>
            <span className="font-semibold text-ink">
              {data.threshold}/{data.memberCount}
            </span>
          </div>
          {pendingMemberProposals.length > 0 && (
            <>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-ink-subtle" />
                <span className="text-ink-muted">Pending</span>
                <span className="font-semibold text-ink">{pendingMemberProposals.length}</span>
              </div>
            </>
          )}
        </div>

        {pendingMemberProposals.length > 0 && (
          <InlineAlert tone="warning">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">Pending member change</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Sign or execute member and threshold proposals from the proposal queue.
                </p>
              </div>
              <Link
                href={`/vault/${multisig}/proposals`}
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
              >
                Open proposals
              </Link>
            </div>
          </InlineAlert>
        )}

        {/* Desktop table */}
        <div className="hidden md:block overflow-hidden rounded-xl border border-border bg-surface shadow-raise-1">
          <div
            className="grid items-center gap-4 border-b border-border/50 px-6 py-3"
            style={{ gridTemplateColumns: "3rem 1fr 10rem 5rem" }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">#</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Address</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Role</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Actions</span>
          </div>
          <div className="divide-y divide-border/40">
            {data.members.map((addr, i) => {
              const isMe = addr === wallet.publicKey?.toBase58();
              return (
                <div
                  key={addr}
                  className="group grid items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-2"
                  style={{ gridTemplateColumns: "3rem 1fr 10rem 5rem" }}
                >
                  <span className="font-mono text-sm font-medium text-ink-subtle">{i + 1}</span>
                  <div className="flex items-center gap-2">
                    <AddressPill value={addr} chars={8} className="bg-transparent border-transparent px-0" />
                    {isMe && (
                      <span className="rounded-full border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                      Signer
                    </span>
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(addr)}
                      title="Copy address"
                      className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <a
                      href={`https://solana.fm/address/${addr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on SolanaFM"
                      className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {data.memberCount > 1 && !isMe && (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(addr)}
                        title="Propose removal"
                        className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-signal-danger/15 hover:text-signal-danger"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {data.members.map((addr, i) => {
            const isMe = addr === wallet.publicKey?.toBase58();
            return (
              <div
                key={addr}
                className="rounded-xl border border-border/60 bg-surface p-4 transition-colors active:bg-surface-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink-subtle">#{i + 1}</span>
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                        Signer
                      </span>
                      {isMe && (
                        <span className="rounded-full border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          You
                        </span>
                      )}
                    </div>
                    <div className="mt-1 break-all font-mono text-sm text-ink">
                      {addr}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(addr)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <a
                    href={`https://solana.fm/address/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </a>
                  {data.memberCount > 1 && !isMe && (
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(addr)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-signal-danger/30 px-3 py-2 text-xs font-medium text-signal-danger transition-colors hover:bg-signal-danger/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs leading-relaxed text-ink-subtle">
          This vault requires any {data.threshold} of {data.memberCount} eligible member
          {data.threshold === 1 ? "" : "s"} to approve a proposal before it can execute. Add/remove
          actions create a Squads config proposal that members must sign.
        </p>
      </div>

      {/* Add Member modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-raise-2">
            <h3 className="mb-1 text-base font-semibold text-ink">Add Member</h3>
            <p className="mb-4 text-xs text-ink-muted">
              Creates a Squads config proposal. Members with signing rights will need to approve it.
            </p>
            <label htmlFor="new-member-address" className="block text-xs font-medium text-ink-muted mb-1.5">
              Member wallet address
            </label>
            <input
              id="new-member-address"
              type="text"
              value={addAddress}
              onChange={(e) => { setAddAddress(e.target.value); setAddError(null); }}
              placeholder="Solana public key"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-ink placeholder-ink-subtle focus:border-accent focus:outline-none"
            />
            {addError && (
              <p className="mt-2 text-xs text-signal-danger">{addError}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                disabled={addLoading}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAddMember()}
                disabled={addLoading || !addAddress.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {addLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
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
          const who = removeTarget ? removeTarget.slice(0, 8) + "…" : "this member";
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
        onCancel={() => { if (!removeLoading) setRemoveTarget(null); }}
      />
    </WorkspacePage>
  );
}

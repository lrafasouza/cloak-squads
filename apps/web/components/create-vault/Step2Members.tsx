"use client";

import { cn } from "@/lib/utils";
import { Key, Minus, Plus, Trash2, UserRound } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";

function isValidPubkey(v: string): boolean {
  if (!v.trim()) return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.trim());
}

interface Step2MembersProps {
  members: string[];
  threshold: number;
  operator: string;
  onAddMember: () => void;
  onRemoveMember: (i: number) => void;
  onUpdateMember: (i: number, v: string) => void;
  onThreshold: (v: number) => void;
  onOperator: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2Members({
  members,
  threshold,
  operator,
  onAddMember,
  onRemoveMember,
  onUpdateMember,
  onThreshold,
  onOperator,
  onNext,
  onBack,
}: Step2MembersProps) {
  const wallet = useWallet();
  const myPubkey = wallet.publicKey?.toBase58() ?? "";

  const allMemberPubkeys = useMemo(() => {
    const extra = members.map((m) => m.trim()).filter(Boolean);
    if (myPubkey && !extra.includes(myPubkey)) return [myPubkey, ...extra];
    return extra.length > 0 ? extra : [myPubkey];
  }, [members, myPubkey]);

  const totalCount = allMemberPubkeys.length;

  const duplicates = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<number>();
    members.forEach((m, i) => {
      const v = m.trim();
      if (!v) return;
      if (seen.has(v) || v === myPubkey) dups.add(i);
      seen.add(v);
    });
    return dups;
  }, [members, myPubkey]);

  const allValid =
    members.every((m) => !m.trim() || isValidPubkey(m)) && duplicates.size === 0;
  const canProceed = allValid && operator.trim() && isValidPubkey(operator);

  const thresholdPercent = Math.round((threshold / Math.max(totalCount, 1)) * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Members card */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-raise-1 md:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Members</h2>
          <span className="text-xs text-ink-subtle tabular-nums">{totalCount}/10</span>
        </div>

        {/* Connected wallet — always first, read-only */}
        {myPubkey && (
          <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20">
              <UserRound className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-mono text-xs text-accent">{myPubkey}</p>
              <p className="text-[10px] text-accent/70">You (connected wallet)</p>
            </div>
          </div>
        )}

        {/* Additional members */}
        <div className="flex flex-col gap-2">
          {members.map((value, i) => {
            const isDup = duplicates.has(i);
            const invalid = value.trim() && !isValidPubkey(value);
            return (
              <div key={`member-${i}`} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(e) => onUpdateMember(i, e.target.value)}
                    placeholder={`Additional member ${i + 1} pubkey`}
                    className={cn(
                      "w-full rounded-lg border bg-surface-2 px-3 py-2.5 font-mono text-xs text-ink placeholder:text-ink-subtle",
                      "focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors",
                      isDup
                        ? "border-signal-warn/60 focus:ring-signal-warn/30"
                        : invalid
                          ? "border-signal-danger/60 focus:ring-signal-danger/30"
                          : "border-border hover:border-border-strong focus:border-border-strong",
                    )}
                  />
                  {isDup && (
                    <p className="mt-0.5 text-[10px] text-signal-warn">Already added</p>
                  )}
                  {invalid && !isDup && (
                    <p className="mt-0.5 text-[10px] text-signal-danger">Invalid address</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveMember(i)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-ink-subtle transition-colors hover:border-signal-danger/40 hover:text-signal-danger"
                  aria-label="Remove member"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {members.length < 9 && (
          <button
            type="button"
            onClick={onAddMember}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
            Add member
          </button>
        )}

        <p className="mt-3 text-xs text-ink-muted">
          Only add wallets you fully control. CEX addresses cannot sign transactions.
        </p>
      </div>

      {/* Threshold card */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-raise-1 md:p-8">
        <h2 className="mb-1 text-sm font-semibold text-ink">Approval threshold</h2>
        <p className="mb-4 text-xs text-ink-muted">
          How many members must approve a proposal for it to execute.
        </p>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onThreshold(Math.max(1, threshold - 1))}
            disabled={threshold <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:opacity-40"
            aria-label="Decrease threshold"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <span className="text-3xl font-bold tabular-nums text-ink">{threshold}</span>
            <span className="text-lg text-ink-muted"> / {totalCount}</span>
            <p className="mt-0.5 text-xs text-ink-subtle">{thresholdPercent}% approval required</p>
          </div>
          <button
            type="button"
            onClick={() => onThreshold(Math.min(totalCount, threshold + 1))}
            disabled={threshold >= totalCount}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:opacity-40"
            aria-label="Increase threshold"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {threshold === 1 && totalCount === 1 && (
          <p className="mt-3 text-xs text-ink-muted">
            Add another member as a backup. Losing access to your wallet means losing access to
            your vault assets.
          </p>
        )}
        {threshold === totalCount && totalCount > 1 && (
          <p className="mt-3 text-xs text-ink-muted">
            Requiring all members means a single offline signer blocks every transaction. Consider
            an M-of-N setup where M is less than N.
          </p>
        )}
      </div>

      {/* Operator card */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-raise-1 md:p-8">
        <div className="mb-1 flex items-center gap-2">
          <Key className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-ink">Operator wallet</h2>
        </div>
        <p className="mb-4 text-xs text-ink-muted">
          This wallet executes approved private transactions on your behalf. It can be a member
          wallet or a separate hot wallet.
        </p>

        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={operator}
          onChange={(e) => onOperator(e.target.value)}
          placeholder="Operator pubkey"
          className={cn(
            "w-full rounded-lg border bg-surface-2 px-3 py-2.5 font-mono text-xs text-ink placeholder:text-ink-subtle",
            "focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors",
            operator.trim() && !isValidPubkey(operator)
              ? "border-signal-danger/60"
              : "border-border hover:border-border-strong focus:border-border-strong",
          )}
        />
        <div className="mt-2 flex gap-2">
          {myPubkey && (
            <button
              type="button"
              onClick={() => onOperator(myPubkey)}
              className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
            >
              Use my wallet
            </button>
          )}
          {members[0] && isValidPubkey(members[0]) && (
            <button
              type="button"
              onClick={() => onOperator(members[0] ?? "")}
              className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
            >
              Use first member
            </button>
          )}
          {operator && (
            <button
              type="button"
              onClick={() => onOperator("")}
              className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={!canProceed}
          onClick={onNext}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all",
            "shadow-raise-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            canProceed
              ? "bg-accent text-accent-ink hover:bg-accent-hover cursor-pointer"
              : "bg-surface-2 text-ink-subtle cursor-not-allowed",
          )}
        >
          Review →
        </button>
      </div>
    </div>
  );
}

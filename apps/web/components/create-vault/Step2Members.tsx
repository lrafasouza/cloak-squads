"use client";

import { cn } from "@/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { CheckCircle2, Key, Minus, Plus, Trash2, UserRound } from "lucide-react";
import { useMemo } from "react";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type WalletStatus = "empty" | "format" | "off-curve" | "valid";

function getWalletStatus(v: string): WalletStatus {
  const s = v.trim();
  if (!s) return "empty";
  if (!BASE58_RE.test(s)) return "format";
  try {
    const pk = new PublicKey(s);
    if (!PublicKey.isOnCurve(pk.toBytes())) return "off-curve";
    return "valid";
  } catch {
    return "format";
  }
}

function isValidWallet(v: string): boolean {
  return getWalletStatus(v) === "valid";
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

  const allValid = members.every((m) => !m.trim() || isValidWallet(m)) && duplicates.size === 0;
  const operatorStatus = getWalletStatus(operator);
  const canProceed = allValid && operatorStatus === "valid";

  const thresholdPercent = Math.round((threshold / Math.max(totalCount, 1)) * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Council card — members */}
      <section className="card-panel relative">
        <div className="px-6 py-6 md:px-7 md:py-7">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <p className="text-eyebrow">Council</p>
              <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-ink">
                Members & co-signers
              </h2>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-ink-subtle">
              {totalCount}/10
            </span>
          </div>

          {/* Connected wallet — crest holder */}
          {myPubkey && (
            <div className="mb-2.5 flex items-center gap-3 rounded-md border border-accent/25 bg-accent-soft px-3.5 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
                <UserRound className="h-3.5 w-3.5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate font-mono text-xs text-accent">{myPubkey}</p>
                <p className="text-[10px] italic text-accent/70">Crest holder · connected wallet</p>
              </div>
            </div>
          )}

          {/* Additional members */}
          {members.length > 0 && (
            <div className="flex flex-col gap-2">
              {members.map((value, i) => {
                const isDup = duplicates.has(i);
                const status = getWalletStatus(value);
                const invalid = status === "format";
                const offCurve = status === "off-curve";
                const valid = status === "valid" && !isDup;
                return (
                  <div key={`member-${i}`} className="flex items-start gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={value}
                        onChange={(e) => onUpdateMember(i, e.target.value)}
                        placeholder={`Co-signer ${i + 1} pubkey`}
                        className={cn(
                          "w-full rounded-md border bg-surface-2 py-2.5 pl-3 pr-9 font-mono text-xs text-ink placeholder:text-ink-subtle/70",
                          "focus:outline-none focus:ring-2 focus:ring-accent/40 transition-aegis",
                          isDup
                            ? "border-signal-warn/60 focus:ring-signal-warn/30"
                            : invalid || offCurve
                              ? "border-signal-danger/60 focus:ring-signal-danger/30"
                              : valid
                                ? "border-signal-positive/40 focus:ring-signal-positive/30"
                                : "border-border hover:border-border-strong focus:border-border-strong",
                        )}
                      />
                      {valid && (
                        <CheckCircle2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-signal-positive" />
                      )}
                      {isDup && <p className="mt-1 text-[10px] text-signal-warn">Already added</p>}
                      {invalid && !isDup && (
                        <p className="mt-1 text-[10px] text-signal-danger">
                          Invalid Solana address
                        </p>
                      )}
                      {offCurve && !isDup && (
                        <p className="mt-1 text-[10px] text-signal-danger">
                          This is a program-owned address, not a wallet
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveMember(i)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-ink-subtle transition-aegis hover:border-signal-danger/40 hover:text-signal-danger"
                      aria-label="Remove member"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {members.length < 9 && (
            <button
              type="button"
              onClick={onAddMember}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2.5 text-xs font-medium text-ink-muted transition-aegis hover:border-accent/40 hover:bg-accent-soft/30 hover:text-ink"
            >
              <Plus className="h-3.5 w-3.5" />
              Add co-signer
            </button>
          )}

          <p className="mt-3 text-[11px] italic text-ink-subtle/80">
            Only add wallets you fully control. CEX addresses cannot sign.
          </p>
        </div>
      </section>

      {/* Quorum card — threshold */}
      <section className="card-panel relative">
        <div className="px-6 py-6 md:px-7 md:py-7">
          <p className="text-eyebrow">Quorum</p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-ink">
            Approval threshold
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            How many members must approve a proposal for it to execute.
          </p>

          <div className="mt-5 flex items-center gap-5">
            <button
              type="button"
              onClick={() => onThreshold(Math.max(1, threshold - 1))}
              disabled={threshold <= 1}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-ink-muted transition-aegis hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Decrease threshold"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-display text-5xl font-semibold tabular-nums tracking-tight text-ink">
                  {threshold}
                </span>
                <span className="font-display text-2xl text-ink-subtle/60">/ {totalCount}</span>
              </div>
              <p className="mt-1 text-[11px] italic text-ink-subtle/80">
                {thresholdPercent}% approval required
              </p>
            </div>
            <button
              type="button"
              onClick={() => onThreshold(Math.min(totalCount, threshold + 1))}
              disabled={threshold >= totalCount}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-ink-muted transition-aegis hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Increase threshold"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Operator card */}
      <section className="card-panel relative">
        <div className="px-6 py-6 md:px-7 md:py-7">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-accent" />
            <p className="text-eyebrow">Operator</p>
          </div>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-ink">
            Privacy operator wallet
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Executes approved private transactions on your behalf. Can be a member or a separate hot
            wallet.
          </p>

          <div className="relative mt-4">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={operator}
              onChange={(e) => onOperator(e.target.value)}
              placeholder="Paste a Solana wallet address"
              className={cn(
                "w-full rounded-md border bg-surface-2 py-2.5 pl-3 pr-9 font-mono text-xs text-ink placeholder:text-ink-subtle/70",
                "focus:outline-none focus:ring-2 focus:ring-accent/40 transition-aegis",
                operatorStatus === "format" || operatorStatus === "off-curve"
                  ? "border-signal-danger/60 focus:ring-signal-danger/30"
                  : operatorStatus === "valid"
                    ? "border-signal-positive/40 focus:ring-signal-positive/30"
                    : "border-border hover:border-border-strong focus:border-border-strong",
              )}
            />
            {operatorStatus === "valid" && (
              <CheckCircle2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-signal-positive" />
            )}
          </div>

          {operatorStatus === "format" && (
            <p className="mt-1.5 text-[11px] text-signal-danger">Invalid Solana address</p>
          )}
          {operatorStatus === "off-curve" && (
            <p className="mt-1.5 text-[11px] text-signal-danger">
              This is a program-owned address, not a wallet — operator must be able to sign
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {myPubkey && operator !== myPubkey && (
              <button
                type="button"
                onClick={() => onOperator(myPubkey)}
                className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-ink-muted transition-aegis hover:border-border-strong hover:text-ink"
              >
                Use my wallet
              </button>
            )}
            {members[0] && isValidWallet(members[0]) && operator !== members[0] && (
              <button
                type="button"
                onClick={() => onOperator(members[0] ?? "")}
                className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-ink-muted transition-aegis hover:border-border-strong hover:text-ink"
              >
                Use first co-signer
              </button>
            )}
            {operator && (
              <button
                type="button"
                onClick={() => onOperator("")}
                className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-ink-muted transition-aegis hover:border-border-strong hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center rounded-md border border-border px-5 py-2.5 text-sm font-medium text-ink-muted transition-aegis hover:border-border-strong hover:text-ink"
        >
          <span aria-hidden="true">←</span>
          <span className="ml-1.5">Back</span>
        </button>
        <button
          type="button"
          disabled={!canProceed}
          onClick={onNext}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold transition-aegis",
            "shadow-raise-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            canProceed
              ? "bg-accent text-accent-ink hover:bg-accent-hover cursor-pointer"
              : "bg-surface-2 text-ink-subtle cursor-not-allowed",
          )}
        >
          Review
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

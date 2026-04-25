"use client";

import { commitmentsEqual, recomputeCommitment, type CommitmentClaim } from "@cloak-squads/core/commitment";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type CommitmentCheckState = "checking" | "match" | "mismatch" | "unavailable";

function truncateBase58(bytes: Uint8Array) {
  const encoded = new PublicKey(bytes).toBase58();
  return `${encoded.slice(0, 6)}...${encoded.slice(-6)}`;
}

export function CommitmentCheck({
  claim,
  onStateChange,
}: {
  claim: CommitmentClaim & { onChainCommitment: Uint8Array };
  onStateChange?: (state: CommitmentCheckState) => void;
}) {
  const [computed, setComputed] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setComputed(null);
    recomputeCommitment(claim)
      .then((value) => {
        if (!cancelled) setComputed(value);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Commitment check failed");
      });
    return () => {
      cancelled = true;
    };
  }, [claim]);

  const state: CommitmentCheckState = useMemo(() => {
    if (error) return "unavailable";
    if (!computed) return "checking";
    return commitmentsEqual(computed, claim.onChainCommitment) ? "match" : "mismatch";
  }, [computed, error, claim.onChainCommitment]);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  const stateLabel =
    state === "match"
      ? "Match"
      : state === "mismatch"
        ? "Mismatch"
        : state === "checking"
          ? "Checking…"
          : "Unavailable";
  const stateColor =
    state === "match"
      ? "text-emerald-300"
      : state === "mismatch"
        ? "text-red-300"
        : state === "unavailable"
          ? "text-amber-300"
          : "text-neutral-300";

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-neutral-50">Commitment check</h2>
        <span className={cn("text-sm font-semibold", stateColor)}>{stateLabel}</span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="text-neutral-400">On-chain</dt>
          <dd className="mt-1 font-mono text-neutral-100">{truncateBase58(claim.onChainCommitment)}</dd>
        </div>
        <div>
          <dt className="text-neutral-400">Local recompute</dt>
          <dd className="mt-1 font-mono text-neutral-100">
            {computed ? truncateBase58(computed) : error ? "Unavailable" : "Checking..."}
          </dd>
        </div>
      </dl>
      {state === "unavailable" ? (
        <p className="mt-4 text-sm text-amber-200">
          Cloak SDK is not initialized in this build, so local recompute could not run. The on-chain
          payload hash is enforced by the gatekeeper program — you can still vote, but commitment
          verification is a defense-in-depth check that should be wired before production.
          {error ? (
            <span className="mt-1 block text-xs text-amber-300/80">Detail: {error}</span>
          ) : null}
        </p>
      ) : null}
      {state === "mismatch" ? (
        <p className="mt-4 text-sm text-red-300">
          Local recompute does NOT match the on-chain commitment. Reject this proposal.
        </p>
      ) : null}
    </section>
  );
}

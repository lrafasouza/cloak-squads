"use client";

import { commitmentsEqual, recomputeCommitment, type CommitmentClaim } from "@cloak-squads/core/commitment";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

function truncateBase58(bytes: Uint8Array) {
  const encoded = new PublicKey(bytes).toBase58();
  return `${encoded.slice(0, 6)}...${encoded.slice(-6)}`;
}

export function CommitmentCheck({
  claim,
  onValidChange,
}: {
  claim: CommitmentClaim & { onChainCommitment: Uint8Array };
  onValidChange?: (valid: boolean) => void;
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

  const valid = useMemo(
    () => (computed ? commitmentsEqual(computed, claim.onChainCommitment) : false),
    [computed, claim.onChainCommitment],
  );

  useEffect(() => {
    onValidChange?.(valid);
  }, [onValidChange, valid]);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-neutral-50">Commitment check</h2>
        <span className={cn("text-sm font-semibold", valid ? "text-emerald-300" : "text-red-300")}>
          {valid ? "Match" : "Mismatch"}
        </span>
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
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
    </section>
  );
}

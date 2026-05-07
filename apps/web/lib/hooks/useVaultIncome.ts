"use client";

import { publicEnv } from "@/lib/env";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

export type IncomeEntry = {
  kind: "income";
  signature: string;
  /** Stringified lamports — preserves precision past Number.MAX_SAFE_INTEGER. */
  amountLamports: string;
  from: string;
  blockTime: number;
  toLabel?: string | undefined; // undefined = primary vault
};

// 200 covers ~60+ days of typical treasury volume on devnet and aligns with
// the upper bound TreasuryFlowStrip needs for its 30-day delta calculation.
const FETCH_LIMIT = 200;

export function vaultIncomeQueryKey(multisig: string) {
  return ["vault-income", multisig] as const;
}

/**
 * Income for the vault. Read-only consumer hook. Multiple consumers on the
 * same page (RecentActivity, TreasuryFlowStrip, etc.) share the underlying
 * query through a single React Query cache entry keyed by multisig only.
 *
 * For chain-driven real-time refresh, mount `useVaultIncomeSync` once on
 * the page that needs it. Today only the vault dashboard mounts the sync
 * hook — pages that don't display live income (proposals, members, etc.)
 * skip it intentionally to avoid extra WebSocket subscriptions. If a future
 * page wants live income, mount `useVaultIncomeSync` there too; the
 * module-level subscription map is ref-counted across multiple mount sites.
 */
export function useVaultIncome(multisig: string, limit = 10) {
  const query = useQuery({
    queryKey: vaultIncomeQueryKey(multisig),
    enabled: !!multisig,
    // Income is real-time-ish; let consumers see fresh data within ~20s of a
    // deposit. Long stale windows hide deposits the user just made.
    staleTime: 20_000,
    gcTime: 300_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: false,
    queryFn: async (): Promise<IncomeEntry[]> => {
      const res = await fetch(`/api/vaults/${multisig}/income?limit=${FETCH_LIMIT}`, {
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { entries: IncomeEntry[] };
      return data.entries ?? [];
    },
  });

  // Slice client-side so all consumers share one cache entry regardless of the
  // limit they want to display.
  const sliced = (query.data ?? []).slice(0, limit);

  return {
    ...query,
    data: sliced,
  };
}

// ── Module-level shared subscription registry ──────────────────────────────
//
// Keyed by `${multisig}|${rpcEndpoint}` so a cluster swap (devnet ↔ mainnet)
// or an RPC override change opens a fresh subscription instead of reusing
// one bound to a now-stale WebSocket. Each entry holds the active Solana
// subscription id and a ref count of mounted hooks. The first hook for a
// given key opens the subscription; the last hook to unmount closes it.
type SharedSub = {
  refCount: number;
  subId: number;
  cleanup: () => void;
};
const sharedSubs = new Map<string, SharedSub>();

function subKey(multisig: string, rpcEndpoint: string): string {
  return `${multisig}|${rpcEndpoint}`;
}

/**
 * Subscribe to the primary vault PDA's account changes and trigger a
 * force-sync + cache write whenever new lamports land. Deposits show up
 * in the UI within a few seconds without polling.
 *
 * Mount this on any page that wants live income. Mount sites for the same
 * multisig share a single Solana WebSocket subscription via a ref-counted
 * module-level map; only the first mount opens the subscription, only the
 * last unmount closes it.
 */
export function useVaultIncomeSync(multisig: string): void {
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  const vaultPda = useMemo(() => {
    try {
      const [pda] = squadsVaultPda(
        new PublicKey(multisig),
        new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID),
        0,
      );
      return pda;
    } catch {
      return null;
    }
  }, [multisig]);

  useEffect(() => {
    if (!multisig || !vaultPda) return;

    const key = subKey(multisig, connection.rpcEndpoint);
    const existing = sharedSubs.get(key);
    if (existing) {
      existing.refCount += 1;
      return () => {
        existing.refCount -= 1;
        if (existing.refCount <= 0) {
          existing.cleanup();
          sharedSubs.delete(key);
        }
      };
    }

    let debounce: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    const onChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void refreshIncomeFromChain(
          multisig,
          queryClient,
          () => inFlight,
          (v) => {
            inFlight = v;
          },
        );
      }, 400);
    };

    const subId = connection.onAccountChange(vaultPda, onChange, "confirmed");

    const entry: SharedSub = {
      refCount: 1,
      subId,
      cleanup: () => {
        if (debounce) clearTimeout(debounce);
        void connection.removeAccountChangeListener(subId).catch(() => undefined);
      },
    };
    sharedSubs.set(key, entry);

    return () => {
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        entry.cleanup();
        sharedSubs.delete(key);
      }
    };
  }, [connection, vaultPda, queryClient, multisig]);
}

/**
 * Force-sync the income endpoint and seed the React Query cache directly
 * from the response body. Avoids the wasteful invalidate→refetch second
 * round trip that an `invalidateQueries` call would cause after a
 * successful sync.
 */
async function refreshIncomeFromChain(
  multisig: string,
  queryClient: QueryClient,
  getInFlight: () => boolean,
  setInFlight: (v: boolean) => void,
): Promise<void> {
  if (getInFlight()) return;
  setInFlight(true);
  try {
    const res = await fetch(`/api/vaults/${multisig}/income?limit=${FETCH_LIMIT}&force=true`, {
      cache: "no-store",
    }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json().catch(() => null)) as { entries?: IncomeEntry[] } | null;
      if (data?.entries) {
        queryClient.setQueryData(vaultIncomeQueryKey(multisig), data.entries);
      }
    }
  } finally {
    setInFlight(false);
    // Vault balance also changed; let the balance query pick that up.
    void queryClient.invalidateQueries({ queryKey: ["vault-data", multisig] });
  }
}

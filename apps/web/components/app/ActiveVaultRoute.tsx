"use client";

import { useActiveVaultAddress } from "@/lib/active-vault";
import Link from "next/link";
import { useMemo } from "react";

export function MissingActiveVault() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-raise-1">
        <h1 className="text-xl font-semibold text-ink">No vault selected</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Open or create a Squads multisig before using this workspace.
        </p>
        <Link
          href="/vault"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover"
        >
          Open vault
        </Link>
      </div>
    </div>
  );
}

export function useActiveVaultParams<T extends Record<string, string> = Record<string, never>>(
  extra?: T,
): Promise<{ multisig: string } & T> | null {
  const { activeVault } = useActiveVaultAddress();
  const extraJson = JSON.stringify(extra ?? {});

  return useMemo(() => {
    if (!activeVault) return null;
    const parsedExtra = JSON.parse(extraJson) as T;
    return Promise.resolve({ multisig: activeVault, ...parsedExtra } as {
      multisig: string;
    } & T);
  }, [activeVault, extraJson]);
}

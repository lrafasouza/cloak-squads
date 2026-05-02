"use client";

import { Spinner } from "@/components/ui/skeleton";
import { useVaultData } from "@/lib/use-vault-data";
import { useWallet } from "@solana/wallet-adapter-react";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { WalletGuard } from "./WalletGuard";

/**
 * Extends WalletGuard with an on-chain membership check.
 *
 * After the wallet is connected, this guard fetches the vault's member list
 * and blocks rendering if the connected wallet is NOT a member of the
 * current multisig. This prevents sensitive vault data from being exposed
 * when the user switches to an unrelated wallet.
 */
export function VaultMemberGuard({
  multisig,
  children,
}: {
  multisig: string;
  children: ReactNode;
}) {
  const { publicKey } = useWallet();
  const { data: vault, isLoading, isError } = useVaultData(multisig);

  // 1. Not connected -> let WalletGuard handle it
  if (!publicKey) {
    return <WalletGuard>{children}</WalletGuard>;
  }

  const walletAddress = publicKey.toBase58();

  // 2. Loading vault membership -> spinner (don't flash content)
  if (isLoading) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-ink-subtle" />
      </div>
    );
  }

  // 3. Error loading vault -> block (can't verify membership)
  if (isError || !vault) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface shadow-raise-1">
          <ShieldAlert className="h-7 w-7 text-signal-danger" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">Unable to verify access</h2>
          <p className="mt-1 max-w-xs text-sm text-ink-muted">
            Could not load vault membership. Please check your connection and try again.
          </p>
        </div>
      </div>
    );
  }

  // 4. Connected but NOT a member -> hard block
  const isMember = vault.members.includes(walletAddress);
  if (!isMember) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface shadow-raise-1">
          <ShieldAlert className="h-7 w-7 text-signal-danger" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">Wallet not authorized</h2>
          <p className="mt-1 max-w-xs text-sm text-ink-muted">
            The connected wallet is not a member of this vault. Switch to a member wallet to continue.
          </p>
        </div>
      </div>
    );
  }

  // 5. Member -> render content
  return <>{children}</>;
}

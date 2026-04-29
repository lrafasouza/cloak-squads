"use client";

import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { Logo } from "@/components/brand/Logo";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";

/**
 * Blocks rendering of children until a Solana wallet is connected.
 * Shows a full-page "connect wallet" prompt when disconnected.
 */
export function WalletGuard({ children }: { children: ReactNode }) {
  const { connected, connecting } = useWallet();

  if (connected) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg text-ink">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-30" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 px-4 text-center">
        <Logo href="/" size="md" />

        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface/80 shadow-raise-1">
          <svg
            aria-hidden="true"
            className="h-8 w-8 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-ink">Connect your wallet</h1>
          <p className="mt-2 max-w-sm text-sm text-ink-muted">
            You need a Solana wallet to access the Aegis platform. Connect below to continue.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <ClientWalletButton />
          {connecting && (
            <p className="text-xs text-ink-subtle animate-pulse">Connecting...</p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { Spinner } from "@/components/ui/skeleton";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState, type ReactNode } from "react";

const CHECK_DELAY_MS = 600;

/**
 * Overlay guard for dashboard content.
 *
 * After a page refresh (F5) the Solana wallet adapter needs a brief moment
 * to read localStorage and restore the previous connection. During that
 * window `connected` is briefly `false`. We wait `CHECK_DELAY_MS` before
 * deciding the user is actually disconnected so we never flash the
 * "connect wallet" overlay (or trigger a wallet popup) on refresh.
 *
 * The wallet button lives in the AppShell header, so this overlay only
 * shows a message pointing the user there — no duplicate button.
 */
export function WalletGuard({ children }: { children: ReactNode }) {
  const { connected, connecting } = useWallet();
  const [hasWaited, setHasWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHasWaited(true), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Still checking — show nothing or a subtle spinner so the page doesn't
  // jump when the wallet reconnects a few ms later.
  if (!hasWaited || connecting) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-ink-subtle" />
      </div>
    );
  }

  if (connected) return <>{children}</>;

  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface shadow-raise-1">
        <svg
          aria-hidden="true"
          className="h-7 w-7 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-ink">Wallet required</h2>
        <p className="mt-1 max-w-xs text-sm text-ink-muted">
          Connect your wallet using the button in the top-right header to access the vault.
        </p>
      </div>
    </div>
  );
}

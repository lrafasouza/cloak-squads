"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary for any thrown render in /vault/[multisig]/*.
 *
 * Render-time exceptions (bad multisig PDA, RPC outage hitting a server
 * component, etc.) previously bubbled to the root ErrorBoundary, which
 * shows a generic "Something went wrong" without route context. Putting
 * a per-route boundary here keeps the layout chrome (top nav, theme,
 * wallet button) intact and offers a focused recovery action.
 */
export default function VaultError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the digest so we can correlate with Sentry / Render logs.
    console.error("[vault/error.tsx]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-lg border border-signal-danger/40 bg-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Could not load this vault</h2>
        <p className="text-sm text-ink-subtle">
          {error.message || "An unexpected error interrupted the page."}
        </p>
        {error.digest ? (
          <p className="font-mono text-[11px] text-ink-muted">ref: {error.digest}</p>
        ) : null}
        <div className="flex gap-2">
          <Button onClick={reset} variant="secondary">
            Try again
          </Button>
          <Link
            href="/vault"
            className="inline-flex items-center px-4 py-2 text-sm text-ink-subtle hover:text-ink"
          >
            Back to vaults
          </Link>
        </div>
      </div>
    </div>
  );
}

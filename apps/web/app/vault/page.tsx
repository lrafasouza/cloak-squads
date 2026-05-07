"use client";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/skeleton";
import { VaultSelectionGrid } from "@/components/vault/VaultSelectionGrid";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { useMyVaults } from "@/lib/use-my-vaults";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { motion } from "framer-motion";
import { Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/* ── Redirect ?multisig= param ── */
function useRedirectParam() {
  const router = useRouter();
  useEffect(() => {
    const url = new URL(window.location.href);
    const target = url.searchParams.get("multisig");
    if (target) {
      try {
        new PublicKey(target);
        router.replace(`/vault/${target}`);
      } catch {
        /* ignore invalid pubkey */
      }
    }
  }, [router]);
}

export default function VaultPage() {
  useRedirectParam();
  const { connected } = useWallet();

  const { vaults, loading, error, search } = useMyVaults();

  const hasVaults = vaults.length > 0;
  const isReady = connected && !loading;

  return (
    <div className="relative flex min-h-screen flex-col bg-bg text-ink">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-[0.18]" />
      </div>

      {/* Minimal header — logo + wallet only */}
      <header className="relative z-10 flex items-center justify-between px-4 py-5 md:px-6">
        <Logo size="sm" />
        <ClientWalletButton />
      </header>

      <main className="relative z-10 flex flex-1 flex-col mx-auto w-full max-w-6xl px-4 pt-6 pb-20 md:px-6 md:pt-10 md:pb-28">
        {/* ── Wallet not connected ── */}
        {!connected && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-1 flex-col items-center justify-center text-center"
          >
            <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-surface shadow-raise-1">
              <Wallet className="h-9 w-9 text-accent" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-display font-bold text-ink">
              Connect your <span className="text-accent">wallet</span>
            </h1>
            <p className="mt-3 max-w-md text-lg leading-relaxed text-ink-muted">
              Link your Solana wallet to discover vaults you have access to.
            </p>
            <div className="mt-8">
              <ClientWalletButton />
            </div>
          </motion.div>
        )}

        {/* ── Loading ── */}
        {connected && loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <Spinner size="lg" />
            <div>
              <p className="text-sm font-medium text-ink">Scanning for vaults</p>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {connected && !loading && error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
          >
            <p className="text-sm text-signal-danger">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => search()}>
              Retry
            </Button>
          </motion.div>
        )}

        {/* ── Vault selection grid ── */}
        {isReady && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-12 text-center md:mb-16">
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="font-display text-display font-bold text-ink"
              >
                Select your <span className="text-accent">vault</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mx-auto mt-3 max-w-lg text-ink-muted"
              >
                Choose a vault to manage private payments, payroll, and treasury operations.
              </motion.p>
            </div>

            {!hasVaults && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mb-8 text-center text-sm text-ink-subtle"
              >
                No vaults found yet, create your first one below.
              </motion.p>
            )}

            <VaultSelectionGrid vaults={vaults} />
          </motion.div>
        )}
      </main>
    </div>
  );
}

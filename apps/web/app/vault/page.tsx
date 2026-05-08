"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/skeleton";
import { VaultSelectionGrid } from "@/components/vault/VaultSelectionGrid";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { WalletMenu } from "@/components/wallet/WalletMenu";
import { useMyVaults } from "@/lib/use-my-vaults";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { motion } from "framer-motion";
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
      {/* Background — radial fade + faint grid + page-level watermark */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-[0.18]" />
        <HeraldicWatermark
          size={520}
          opacity={0.025}
          className="-right-24 -top-24 bottom-auto"
        />
      </div>

      {/* Header — logo + wallet, with brass rule below */}
      <header className="relative z-10 border-b border-border/60">
        <div className="flex items-center justify-between px-4 py-4 md:px-6">
          <Logo size="sm" />
          <WalletMenu />
        </div>
        {/* Brass rule */}
        <div className="h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent" />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-20 pt-8 md:px-6 md:pb-28 md:pt-14">
        {/* ── Wallet not connected ── */}
        {!connected && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-1 flex-col items-center justify-center"
          >
            <section className="card-hero relative mx-auto w-full max-w-md">
              {/* Brass top rail */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

              <div className="px-7 py-10 text-center md:px-10 md:py-12">
                {/* Æ crest */}
                <div className="relative mx-auto inline-block">
                  <div className="absolute inset-0 -m-3 rounded-panel border border-accent/20" />
                  <div className="absolute inset-0 -m-6 rounded-panel border border-accent/10" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-panel border border-border-strong bg-surface-2 shadow-raise-1">
                    <span className="font-display text-3xl font-semibold text-accent leading-none">
                      Æ
                    </span>
                  </div>
                </div>

                <p className="mt-7 text-eyebrow">Aegis · Privacy multisig</p>
                <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  Connect your wallet
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
                  Link your Solana wallet to discover the vaults you can govern.
                </p>

                <div className="mx-auto mt-7 h-px w-3/4 bg-gradient-to-r from-transparent via-border to-transparent" />

                <div className="mt-7 flex justify-center">
                  <ClientWalletButton />
                </div>
              </div>
            </section>
          </motion.div>
        )}

        {/* ── Loading ── */}
        {connected && loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-eyebrow">Reading the ledger</p>
            <Spinner size="lg" />
            <p className="text-sm text-ink-muted">Scanning for vaults you govern…</p>
          </div>
        )}

        {/* ── Error ── */}
        {connected && !loading && error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
          >
            <p className="text-eyebrow">Ledger unreachable</p>
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
            <div className="mb-10 text-center md:mb-14">
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="text-eyebrow"
              >
                Your treasury archive
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="mt-3 font-display text-display font-semibold tracking-tight text-ink"
              >
                Select your <span className="text-accent">vault</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mx-auto mt-3 max-w-lg text-ink-muted"
              >
                {hasVaults
                  ? "Choose a treasury to govern private payments, payroll, and audit."
                  : "No vaults yet — forge your first one to begin."}
              </motion.p>
            </div>

            <VaultSelectionGrid vaults={vaults} />
          </motion.div>
        )}
      </main>
    </div>
  );
}

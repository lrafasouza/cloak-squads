"use client";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/skeleton";
import { VaultSelectionGrid } from "@/components/vault/VaultSelectionGrid";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { useMyVaults } from "@/lib/use-my-vaults";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { motion } from "framer-motion";
import { ArrowRight, Search, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

/* ── Import by address inline form ── */
function ImportAddressForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      const pk = new PublicKey(trimmed);
      router.push(`/vault/${pk.toBase58()}`);
    } catch {
      setError("Invalid Solana address");
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onSubmit={handleSubmit}
      className="mx-auto flex max-w-lg items-center gap-2"
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
        <Input
          type="text"
          autoFocus
          placeholder="Paste Squads multisig address…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          className="h-12 border-border-strong bg-surface-2 pl-10 font-mono text-sm"
        />
      </div>
      <Button type="submit" disabled={!value.trim()} size="icon" className="h-12 w-12 shrink-0">
        <ArrowRight className="h-4 w-4" />
      </Button>
      <button
        type="button"
        onClick={onClose}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border-strong text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Cancel"
      >
        <X className="h-4 w-4" />
      </button>
      {error && <p className="absolute -bottom-6 left-0 text-xs text-signal-danger">{error}</p>}
    </motion.form>
  );
}

export default function VaultPage() {
  useRedirectParam();
  const { connected } = useWallet();

  const { vaults, loading, error, search } = useMyVaults();
  const [showImport, setShowImport] = useState(false);

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
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="mt-6 text-sm text-accent underline-offset-4 transition-colors hover:text-accent-hover hover:underline"
            >
              or enter a vault address manually
            </button>

            {showImport && (
              <div className="mt-6 w-full">
                <ImportAddressForm onClose={() => setShowImport(false)} />
              </div>
            )}
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
                No vaults found yet — create one or import an existing vault.
              </motion.p>
            )}

            <VaultSelectionGrid vaults={vaults} onImportClick={() => setShowImport(true)} />

            {showImport && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto mt-10 max-w-xl"
              >
                <ImportAddressForm onClose={() => setShowImport(false)} />
              </motion.div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}

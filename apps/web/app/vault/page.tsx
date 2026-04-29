"use client";

import { CreateMultisigCard } from "@/components/create-multisig/CreateMultisigCard";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/* ── Redirect ?multisig= param ── */
function useRedirectParam() {
  const [redirected, setRedirected] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const url = new URL(window.location.href);
    const target = url.searchParams.get("multisig");
    if (target) {
      try {
        new PublicKey(target);
        router.replace(`/vault/${target}`);
        setRedirected(true);
      } catch {
        /* ignore invalid pubkey */
      }
    }
  }, [router]);
  return redirected;
}

export default function VaultPage() {
  const redirected = useRedirectParam();
  const router = useRouter();
  const { addToast } = useToast();
  const wallet = useWallet();

  const [multisigInput, setMultisigInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  if (redirected) return null;

  function onOpenMultisig(e: React.FormEvent) {
    e.preventDefault();
    setInputError(null);
    const trimmed = multisigInput.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const pk = new PublicKey(trimmed);
      addToast("Opening vault...", "info", 2000);
      router.push(`/vault/${pk.toBase58()}`);
    } catch {
      setInputError("Invalid Solana address");
      addToast("Invalid Solana address", "error");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-bg text-ink">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-30" />
      </div>

      <SiteHeader />

      <main className="relative z-10 mx-auto max-w-5xl px-4 pt-24 pb-20 md:px-6 md:pt-32 md:pb-28">
        <div className="mb-12 text-center">
          <h1 className="font-display text-display font-bold text-ink">
            Access your <span className="text-accent">Vault</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">
            Open an existing Squads multisig or create a new one to start using private execution.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 md:items-start">
          {/* Open existing vault */}
          <div className="rounded-xl border border-border bg-surface/80 p-6 shadow-raise-1 backdrop-blur-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
              <LogIn className="h-5 w-5 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-ink">Open existing vault</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Enter your Squads multisig address to access an existing vault.
            </p>

            <form onSubmit={onOpenMultisig} className="mt-6 space-y-3">
              <div>
                <Input
                  type="text"
                  placeholder="Squads multisig address..."
                  value={multisigInput}
                  onChange={(e) => {
                    setMultisigInput(e.target.value);
                    setInputError(null);
                  }}
                  className="h-12 font-mono"
                />
                {inputError && (
                  <p className="mt-2 text-sm text-signal-danger">{inputError}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isSubmitting || !multisigInput.trim()}
                isLoading={isSubmitting}
                size="lg"
                className="w-full"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Open Vault
              </Button>
            </form>

            {!wallet.connected && (
              <p className="mt-4 text-xs text-ink-subtle">
                You&apos;ll need a Solana wallet to interact with Aegis.
              </p>
            )}
          </div>

          {/* Create new vault */}
          <CreateMultisigCard
            onCreated={(multisigPda) => router.push(`/vault/${multisigPda}`)}
          />
        </div>
      </main>
    </div>
  );
}

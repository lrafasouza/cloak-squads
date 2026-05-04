"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { truncateAddress } from "@/lib/proposals";
import { useMyVaults } from "@/lib/use-my-vaults";
import { ArrowRight, SearchX, Vault } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ImportVaultsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ImportVaultsModal({ open, onOpenChange }: ImportVaultsModalProps) {
  const router = useRouter();
  const { vaults, loading, error, search } = useMyVaults();

  useEffect(() => {
    if (open) {
      search();
    }
  }, [open, search]);

  function handleSelect(addr: string) {
    onOpenChange(false);
    router.push(`/vault/${addr}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Your Squads vaults</DialogTitle>
          <DialogDescription>
            Vaults on Squads mainnet where your wallet is a member.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-4">
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 w-full animate-pulse rounded-xl border border-border bg-surface-2/50"
                />
              ))}
              <p className="pt-1 text-center text-xs text-ink-subtle">
                Searching on-chain — this takes a few seconds…
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <SearchX className="h-8 w-8 text-ink-subtle" />
              <p className="text-sm text-signal-danger">{error}</p>
            </div>
          )}

          {!loading && !error && vaults.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <SearchX className="h-8 w-8 text-ink-subtle" />
              <p className="text-sm text-ink-muted">No vaults found for this wallet on mainnet.</p>
            </div>
          )}

          {!loading && vaults.length > 0 && (
            <div className="space-y-2">
              {vaults.map((vault) => (
                <button
                  key={vault.cofreAddress}
                  type="button"
                  onClick={() => handleSelect(vault.cofreAddress)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3 text-left transition-all hover:border-accent/40 hover:bg-surface-2 hover:shadow-raise-1"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                    <Vault className="h-4 w-4 text-accent" />
                  </div>
                  <span className="flex-1 font-mono text-sm text-ink">{vault.name || truncateAddress(vault.cofreAddress)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import type { AegisVault } from "@/lib/use-my-vaults";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { truncateAddress } from "@/lib/proposals";
import { motion } from "framer-motion";
import { Check, Plus, Upload } from "lucide-react";
import Link from "next/link";

/* ─── Vault card with DB metadata ─── */
function VaultCard({
  vault,
  index,
}: {
  vault: AegisVault;
  index: number;
}) {
  const displayName = vault.name || truncateAddress(vault.cofreAddress);

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: index * 0.07,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Link
        href={`/vault/${vault.cofreAddress}`}
        className="group relative flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface/50 p-6 pb-5 backdrop-blur-sm transition-all duration-300 hover:scale-[1.045] hover:border-accent/30 hover:bg-surface hover:shadow-accent-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:p-10 sm:pb-7"
      >
        {/* Avatar */}
        <div className="relative">
          <VaultIdenticon
            seed={vault.cofreAddress}
            size={100}
            className="rounded-2xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
          />
          {vault.name ? (
            <div className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft ring-[3px] ring-surface">
              <Check className="h-3 w-3 text-accent" strokeWidth={3} />
            </div>
          ) : null}
        </div>

        {/* Name & address */}
        <div className="text-center">
          <p className="text-[17px] font-semibold text-ink transition-colors duration-300 group-hover:text-accent">
            {displayName}
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-ink-subtle">
            {truncateAddress(vault.cofreAddress)}
          </p>
        </div>

        {/* Hover checkmark */}
        <div className="absolute right-3 top-3 opacity-0 transition-all duration-300 group-hover:opacity-100">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/90">
            <Check className="h-3.5 w-3.5 text-accent-ink" strokeWidth={3} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─── "Create new vault" card ─── */
function CreateVaultCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: index * 0.07,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Link
        href="/create"
        className="group relative flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-surface/30 p-6 pb-5 backdrop-blur-sm transition-all duration-300 hover:scale-[1.045] hover:border-accent/30 hover:bg-surface/50 hover:shadow-accent-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:p-10 sm:pb-7"
      >
        <div className="flex h-[100px] w-[100px] items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2/40 transition-all duration-300 group-hover:border-accent/25 group-hover:bg-accent-soft/20">
          <Plus className="h-10 w-10 text-ink-subtle transition-colors duration-300 group-hover:text-accent" strokeWidth={1.5} />
        </div>

        <div className="text-center">
          <p className="text-[17px] font-semibold text-ink-muted transition-colors duration-300 group-hover:text-accent">
            Create vault
          </p>
          <p className="mt-1 text-[11px] text-ink-subtle">
            New Squads multisig
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─── "Import by address" card — disabled, Coming soon ─── */
function ImportCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: index * 0.07,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div
        aria-disabled="true"
        className="group relative flex w-full flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-surface/20 p-6 pb-5 opacity-60 backdrop-blur-sm sm:p-10 sm:pb-7"
      >
        <span className="absolute right-3 top-3 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
          Coming soon
        </span>

        <div className="flex h-[100px] w-[100px] items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2/40">
          <Upload className="h-10 w-10 text-ink-subtle" strokeWidth={1.5} />
        </div>

        <div className="text-center">
          <p className="text-[17px] font-semibold text-ink-muted">Import vault</p>
          <p className="mt-1 text-[11px] text-ink-subtle">By address</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main grid component ─── */
export function VaultSelectionGrid({ vaults }: { vaults: AegisVault[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {vaults.map((vault, i) => (
        <VaultCard key={vault.cofreAddress} vault={vault} index={i} />
      ))}
      <CreateVaultCard index={vaults.length} />
      <ImportCard index={vaults.length + 1} />
    </div>
  );
}

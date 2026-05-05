"use client";

import type { AegisVault } from "@/lib/use-my-vaults";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { truncateAddress } from "@/lib/proposals";
import { motion } from "framer-motion";
import { Check, Plus, Search, Upload } from "lucide-react";
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

/* ─── "Import by address" card ─── */
function ImportCard({ index, onClick }: { index: number; onClick: () => void }) {
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
      <button
        type="button"
        onClick={onClick}
        className="group relative flex w-full flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-surface/30 p-6 pb-5 backdrop-blur-sm transition-all duration-300 hover:scale-[1.045] hover:border-accent/30 hover:bg-surface/50 hover:shadow-[0_8px_32px_rgba(201,168,106,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:p-10 sm:pb-7"
      >
        <div className="flex h-[100px] w-[100px] items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2/40 transition-all duration-300 group-hover:border-accent/25 group-hover:bg-accent-soft/20">
          <Upload className="h-10 w-10 text-ink-subtle transition-colors duration-300 group-hover:text-accent" strokeWidth={1.5} />
        </div>

        <div className="text-center">
          <p className="text-[17px] font-semibold text-ink-muted transition-colors duration-300 group-hover:text-accent">
            Import vault
          </p>
          <p className="mt-1 text-[11px] text-ink-subtle">
            By address
          </p>
        </div>
      </button>
    </motion.div>
  );
}

/* ─── Main grid component ─── */
export function VaultSelectionGrid({
  vaults,
  onImportClick,
}: {
  vaults: AegisVault[];
  onImportClick: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {vaults.map((vault, i) => (
        <VaultCard key={vault.cofreAddress} vault={vault} index={i} />
      ))}
      <ImportCard index={vaults.length} onClick={onImportClick} />
      <CreateVaultCard index={vaults.length + 1} />
    </div>
  );
}

/* ─── Empty state ─── */
export function VaultEmptyState({ onImportClick }: { onImportClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center"
    >
      <div className="relative mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-surface shadow-raise-1">
        <Search className="h-8 w-8 text-accent" strokeWidth={1.5} />
        <div className="pointer-events-none absolute -inset-3 rounded-full bg-accent/[0.04] blur-xl" />
      </div>
      <h3 className="font-display text-xl font-semibold text-ink">
        No vaults yet
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        There are no Aegis vaults in the database yet. Create one or import an existing vault address.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onImportClick}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-surface-2 px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-3 hover:border-accent/20"
        >
          <Upload className="h-4 w-4" />
          Import by address
        </button>
        <Link
          href="/create"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover shadow-raise-1"
        >
          <Plus className="h-4 w-4" />
          Create vault
        </Link>
      </div>
    </motion.div>
  );
}

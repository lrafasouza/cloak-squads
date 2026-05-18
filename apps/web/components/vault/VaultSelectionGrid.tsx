"use client";

import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { truncateAddress } from "@/lib/proposals";
import type { AegisVault } from "@/lib/use-my-vaults";
import { motion } from "framer-motion";
import { ArrowUpRight, Plus, Upload } from "lucide-react";
import Link from "next/link";

/* ─── Vault card ─── */
function VaultCard({
  vault,
  index,
}: {
  vault: AegisVault;
  index: number;
}) {
  const displayName = vault.name || truncateAddress(vault.cofreAddress);
  const hasName = !!vault.name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.45,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Link
        href={`/vault/${vault.cofreAddress}`}
        className="group relative flex flex-col items-center gap-5 rounded-panel border border-border/70 bg-surface p-7 pb-6 shadow-raise-1 transition-aegis hover:border-accent/40 hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:p-9 sm:pb-7"
      >
        {/* Identicon with brass corner monogram for named vaults */}
        <div className="relative">
          <div className="overflow-hidden rounded-panel border border-border-strong bg-surface-2 shadow-raise-1 transition-aegis group-hover:shadow-raise-2">
            <VaultIdenticon
              seed={vault.cofreAddress}
              size={92}
              className="h-[92px] w-[92px] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
            />
          </div>
          {hasName && (
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-accent/40 bg-bg shadow-raise-1">
              <span className="font-display text-[11px] font-semibold leading-none text-accent">
                Æ
              </span>
            </div>
          )}
        </div>

        {/* Eyebrow + name + address */}
        <div className="flex flex-col items-center text-center">
          <p className="text-eyebrow">Treasury</p>
          <p className="mt-1.5 font-display text-base font-semibold tracking-tight text-ink transition-colors duration-300 group-hover:text-accent">
            {displayName}
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-ink-subtle">
            {truncateAddress(vault.cofreAddress)}
          </p>
        </div>

        {/* Hover open arrow */}
        <div className="absolute right-3 top-3 opacity-0 transition-aegis group-hover:opacity-100">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink shadow-raise-1">
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─── "Forge new vault" card ─── */
function CreateVaultCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.45,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Link
        href="/create"
        className="group relative flex flex-col items-center gap-5 rounded-panel border border-dashed border-border bg-surface/40 p-7 pb-6 transition-aegis hover:border-accent/40 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:p-9 sm:pb-7"
      >
        {/* Æ glyph well */}
        <div className="relative flex h-[92px] w-[92px] items-center justify-center rounded-panel border border-dashed border-border bg-surface-2/40 transition-aegis group-hover:border-accent/30 group-hover:bg-accent-soft/30">
          {/* Watermark Æ in the well */}
          <span
            aria-hidden="true"
            className="absolute font-display text-6xl font-semibold leading-none text-accent/10 transition-aegis group-hover:text-accent/20"
          >
            Æ
          </span>
          <Plus
            className="relative h-9 w-9 text-ink-subtle transition-aegis group-hover:text-accent"
            strokeWidth={1.5}
          />
        </div>

        <div className="flex flex-col items-center text-center">
          <p className="text-eyebrow">Begin</p>
          <p className="mt-1.5 font-display text-base font-semibold tracking-tight text-ink-muted transition-colors duration-300 group-hover:text-accent">
            Forge new vault
          </p>
          <p className="mt-1 text-[11px] italic text-ink-subtle">New Squads multisig</p>
        </div>
      </Link>
    </motion.div>
  );
}

/* ─── "Import by address" card — disabled ─── */
function ImportCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.45,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div
        aria-disabled="true"
        className="group relative flex w-full flex-col items-center gap-5 rounded-panel border border-dashed border-border bg-surface/30 p-7 pb-6 opacity-60 sm:p-9 sm:pb-7"
      >
        <span className="absolute right-3 top-3 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-eyebrow">
          Coming soon
        </span>

        <div className="flex h-[92px] w-[92px] items-center justify-center rounded-panel border border-dashed border-border bg-surface-2/40">
          <Upload className="h-9 w-9 text-ink-subtle" strokeWidth={1.5} />
        </div>

        <div className="flex flex-col items-center text-center">
          <p className="text-eyebrow">Inherit</p>
          <p className="mt-1.5 font-display text-base font-semibold tracking-tight text-ink-muted">
            Import vault
          </p>
          <p className="mt-1 text-[11px] italic text-ink-subtle">By address</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main grid ─── */
export function VaultSelectionGrid({ vaults }: { vaults: AegisVault[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {vaults.map((vault, i) => (
        <VaultCard key={vault.cofreAddress} vault={vault} index={i} />
      ))}
      <CreateVaultCard index={vaults.length} />
      <ImportCard index={vaults.length + 1} />
    </div>
  );
}

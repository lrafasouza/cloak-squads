"use client";

import { generateIdenticon } from "@/lib/identicon";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

/**
 * Governance Ribbon — single-line summary of the multisig's constitution.
 *
 * Replaces the old dual-card "Governance | Cloak Privacy" split block.
 * Cloak privacy is now expressed in:
 *   - the asymmetric KPI ribbon (privacy share, headline KPI)
 *   - the sidebar Cloak banner (partnership seal)
 *
 * That leaves Governance as one short ledger row — threshold, member
 * count, timelock — with member identicons inline. Click target wraps
 * the whole row and routes to /members.
 */

// Returns null when timelock is disabled so the caller can omit the segment
// entirely instead of rendering a "no timelock" filler.
function formatTimeLock(seconds: number): string | null {
  if (!seconds || seconds === 0) return null;
  if (seconds < 60) return `${seconds}s timelock`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m timelock`;
  const hours = seconds / 3600;
  if (hours < 24) {
    const formatted = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
    return `${formatted} timelock`;
  }
  const days = hours / 24;
  const formatted = Number.isInteger(days) ? `${days}d` : `${days.toFixed(1)}d`;
  return `${formatted} timelock`;
}

interface GovernanceRibbonProps {
  multisig: string;
  threshold: number;
  memberCount: number;
  members: string[];
  timeLock: number;
}

export function GovernanceRibbon({
  multisig,
  threshold,
  memberCount,
  members,
  timeLock,
}: GovernanceRibbonProps) {
  // Cap the inline identicons to 4. Anything beyond renders as "+N".
  const visible = useMemo(() => members.slice(0, 4), [members]);
  const overflow = Math.max(0, memberCount - visible.length);

  const identicons = useMemo(
    () => visible.map((addr) => ({ addr, dataUrl: generateIdenticon(addr, 18) })),
    [visible],
  );

  const timeLockLabel = formatTimeLock(timeLock);

  return (
    <Link
      href={`/vault/${multisig}/members`}
      className={cn(
        "card-panel group flex items-center gap-4 px-5 py-4",
        "transition-aegis hover:bg-surface-2",
      )}
    >
      {/* Æ glyph anchor — heraldic ledger seal */}
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-surface-2 font-garamond text-xl font-semibold leading-none text-accent"
        style={{ letterSpacing: "-0.02em" }}
      >
        Æ
      </span>

      {/* Ledger line */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="text-eyebrow shrink-0">Governance</span>
        <span className="hidden text-ink-subtle/40 sm:inline" aria-hidden="true">
          ·
        </span>
        <span className="min-w-0 truncate font-mono text-sm tabular-nums text-ink">
          <span className="font-semibold">
            {threshold}
            <span className="text-ink-subtle/60">/{memberCount}</span>
          </span>
          <span className="px-2 text-ink-subtle/40">·</span>
          <span className="text-ink-muted">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
          {timeLockLabel && (
            <>
              <span className="px-2 text-ink-subtle/40">·</span>
              <span className="text-ink-muted">{timeLockLabel}</span>
            </>
          )}
        </span>
      </div>

      {/* Member identicons */}
      <div className="hidden shrink-0 items-center md:flex">
        {identicons.map(({ addr, dataUrl }, i) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={addr}
            src={dataUrl}
            alt=""
            aria-hidden="true"
            width={18}
            height={18}
            className={cn(
              "h-[18px] w-[18px] rounded-[3px] ring-2 ring-surface",
              i > 0 && "-ml-1.5",
            )}
          />
        ))}
        {overflow > 0 && (
          <span className="-ml-1.5 inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-[3px] bg-surface-2 px-1 text-[9px] font-semibold tabular-nums text-ink-subtle ring-2 ring-surface">
            +{overflow}
          </span>
        )}
      </div>

      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
        aria-hidden="true"
      />
    </Link>
  );
}

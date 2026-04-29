"use client";

import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { type HTMLAttributes, type ReactNode, useState } from "react";

/**
 * Aegis primitives — building blocks que carregam a identidade visual.
 *
 * - `<Eyebrow>`: label mono-caps usado como section eyebrow.
 * - `<Mono>`: texto monospaced com tabular-nums (hashes, addresses, valores).
 * - `<Stat>`: número grande + label + delta opcional.
 * - `<Address>`: address truncado copiável.
 * - `<TtlPill>`: pílula com TTL/expiração.
 * - `<StatusBadge>`: status semântico (sealed, pending, executed, expired, revoked).
 */

/* ─────────────────────────────────────────── Eyebrow ── */
export function Eyebrow({
  children,
  className,
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "div" | "p";
}) {
  return <Tag className={cn("text-eyebrow", className)}>{children}</Tag>;
}

/* ────────────────────────────────────────────── Mono ── */
export function Mono({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("font-mono num text-[0.95em]", className)} {...rest}>
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────── Stat ── */
export function Stat({
  label,
  value,
  hint,
  trend,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: "up" | "down" | "flat";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Eyebrow>{label}</Eyebrow>
      <div className="font-display text-3xl font-semibold tracking-tight text-ink num">
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            "text-xs",
            trend === "up" && "text-signal-positive",
            trend === "down" && "text-signal-danger",
            (!trend || trend === "flat") && "text-ink-subtle",
          )}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────── Address ── */
export function Address({
  value,
  chars = 4,
  className,
  copyable = true,
}: {
  value: string;
  chars?: number;
  className?: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const short =
    value.length > chars * 2 + 1
      ? `${value.slice(0, chars)}…${value.slice(-chars)}`
      : value;

  async function copy() {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copyable ? `Copy ${value}` : value}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-sm font-mono text-sm text-ink-muted transition-colors",
        copyable && "hover:text-ink",
        className,
      )}
    >
      <span className="num">{short}</span>
      {copyable && (
        <span className="text-ink-subtle group-hover:text-ink">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </span>
      )}
    </button>
  );
}

/* ────────────────────────────────────────── TtlPill ── */
export function TtlPill({
  expiresAt,
  className,
}: {
  /** ISO string or Date */
  expiresAt: string | Date;
  className?: string;
}) {
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const ms = target.getTime() - Date.now();
  const expired = ms <= 0;
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  const seconds = Math.floor((Math.abs(ms) % 60_000) / 1000);

  const tone = expired
    ? "border-signal-danger/30 bg-signal-danger/10 text-signal-danger"
    : minutes < 2
      ? "border-signal-warn/30 bg-signal-warn/10 text-signal-warn"
      : "border-border-strong bg-surface-2 text-ink-muted";

  const label = expired
    ? "expired"
    : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-eyebrow num",
        tone,
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          expired ? "bg-signal-danger" : minutes < 2 ? "bg-signal-warn animate-pulse" : "bg-ink-subtle",
        )}
      />
      ttl {label}
    </span>
  );
}

/* ──────────────────────────────────────── StatusBadge ── */
export type AegisStatus =
  | "sealed"
  | "pending"
  | "approved"
  | "executed"
  | "expired"
  | "revoked"
  | "draft";

const statusTone: Record<AegisStatus, string> = {
  sealed: "border-accent/30 bg-accent-soft text-accent",
  pending: "border-border-strong bg-surface-2 text-ink-muted",
  approved: "border-signal-positive/30 bg-signal-positive/10 text-signal-positive",
  executed: "border-signal-positive/40 bg-signal-positive/15 text-signal-positive",
  expired: "border-signal-danger/30 bg-signal-danger/10 text-signal-danger",
  revoked: "border-signal-danger/30 bg-signal-danger/10 text-signal-danger",
  draft: "border-border bg-surface text-ink-subtle",
};

export function StatusBadge({
  status,
  className,
  children,
}: {
  status: AegisStatus;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-eyebrow",
        statusTone[status],
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          status === "sealed" && "bg-accent",
          status === "pending" && "bg-ink-subtle",
          status === "approved" && "bg-signal-positive",
          status === "executed" && "bg-signal-positive",
          status === "expired" && "bg-signal-danger",
          status === "revoked" && "bg-signal-danger",
          status === "draft" && "bg-ink-subtle",
        )}
      />
      {children ?? status}
    </span>
  );
}

/* ──────────────────────────────────────────── Divider ── */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-border", className)} />;
}

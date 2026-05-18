import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Receipt row — a label/value pair separated by a dotted leader line.
 *
 * Used inside modals where we render the final, signed-off detail of a
 * transaction:
 *
 *   Amount        ················  4.2000 SOL
 *   To            ················  7uX1…9pNk
 *   Memo          ················  Q4 contributor payout
 *   Network fee   ···············   0.000005 SOL
 *
 * The leader span is a flexed border-bottom-dotted that fills whatever
 * space is left between label and value. The CSS lives in globals.css under
 * `.receipt-row` so the dotted border colour follows the active theme.
 *
 * Values default to `font-mono tabular-nums` because every receipt value
 * is on-chain data; pass `mono={false}` only when the value is descriptive
 * prose (e.g. memos).
 */

interface ReceiptRowProps {
  label: ReactNode;
  children: ReactNode;
  /** Value typography. Defaults to `mono` (Geist Mono, tabular). */
  mono?: boolean;
  /** Tone for the value — `default` (ink), `muted`, `accent`, `danger`. */
  tone?: "default" | "muted" | "accent" | "danger";
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<ReceiptRowProps["tone"]>, string> = {
  default: "text-ink",
  muted: "text-ink-muted",
  accent: "text-accent",
  danger: "text-signal-danger",
};

export function ReceiptRow({
  label,
  children,
  mono = true,
  tone = "default",
  className,
}: ReceiptRowProps) {
  return (
    <div className={cn("receipt-row", className)}>
      <span className="text-[12px] text-ink-subtle">{label}</span>
      <span className="leader" aria-hidden="true" />
      <span className={cn("text-[13px]", mono ? "font-mono tabular-nums" : "", TONE_CLASSES[tone])}>
        {children}
      </span>
    </div>
  );
}

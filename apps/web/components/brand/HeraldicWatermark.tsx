import { cn } from "@/lib/utils";

/**
 * Aegis heraldic watermark — the Æ glyph used as a quiet brand moment
 * inside hero cards and modals.
 *
 * Usage:
 *   <div className="card-hero relative">
 *     <HeraldicWatermark />
 *     ...content...
 *   </div>
 *
 * The parent must have `position: relative` (the `card-hero`/`card-panel`
 * archetypes already do). Default placement is bottom-right with a 60%
 * offset so the glyph reads as embedded in the surface, not stamped on top.
 *
 * Override placement via `className` if you need a different anchor (e.g.
 * top-left for an audit-export header).
 *
 * Honors theme automatically: `text-accent` resolves to burnished gold in
 * dark and gold-leaf-dark in light — the watermark stays warm in both.
 */

interface HeraldicWatermarkProps {
  /** Glyph size in px. Hero cards: 320–400. Modals: 240–280. */
  size?: number;
  /** 0–1. Default 0.04 keeps it as a quiet whisper, never decoration. */
  opacity?: number;
  /** Position override. Defaults to bottom-right inset. */
  className?: string;
}

export function HeraldicWatermark({
  size = 360,
  opacity = 0.04,
  className,
}: HeraldicWatermarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -bottom-12 -right-12 select-none font-garamond font-semibold leading-none text-accent",
        className,
      )}
      style={{
        fontSize: size,
        letterSpacing: "-0.02em",
        opacity,
      }}
    >
      Æ
    </span>
  );
}

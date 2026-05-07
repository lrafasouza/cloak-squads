"use client";

import { cn } from "@/lib/utils";

type Tone = "accent" | "positive" | "danger" | "muted";

const STROKE: Record<Tone, string> = {
  accent: "text-accent",
  positive: "text-signal-positive",
  danger: "text-signal-danger",
  muted: "text-ink-subtle",
};

const FILL_COLOR: Record<Tone, string> = {
  accent: "var(--accent)",
  positive: "var(--signal-positive)",
  danger: "var(--signal-danger)",
  muted: "var(--ink-subtle)",
};

/**
 * Minimal inline sparkline. Renders a baseline + a stroked path with a soft
 * gradient fill underneath. Accepts a single series of numeric values; the
 * caller is responsible for normalizing or bucketing the data.
 *
 * The component is fluid by default (fills its container width and height)
 * and uses viewBox + preserveAspectRatio="none" so the line stretches with
 * the container. Numeric values are normalized to a 0..1 range internally.
 */
export function MiniSparkline({
  values,
  tone = "accent",
  className,
  showBaseline = true,
  height = 36,
  fillId,
}: {
  values: number[];
  tone?: Tone;
  className?: string;
  showBaseline?: boolean;
  height?: number;
  /** Unique gradient id; required when more than one MiniSparkline renders on the page. */
  fillId: string;
}) {
  // Need at least two points to render a line. With one or zero we render an
  // empty baseline so the layout doesn't shift compared to a populated card.
  if (values.length < 2 || values.every((v) => v === 0)) {
    return (
      <div className={cn("relative w-full", className)} style={{ height }} aria-hidden="true">
        {showBaseline && (
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/50" />
        )}
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);

  // Reserve top/bottom padding so the stroke doesn't clip against the
  // viewBox edges. We use 100x40 viewBox; values map into y in [4, 36].
  const W = 100;
  const H = 40;
  const TOP = 4;
  const BOT = 36;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = BOT - ((v - min) / spread) * (BOT - TOP);
    return [x, y] as const;
  });

  // Build a smooth-ish path using simple line segments (cheaper and crisper at
  // small scales than cubic curves). For a treasury sparkline, the dramatic
  // jumps are part of the signal, so we leave them angular.
  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const fillPath = `${linePath} L${W} ${H} L0 ${H} Z`;

  const gradientId = `spark-fill-${fillId}`;
  const fillColor = FILL_COLOR[tone];

  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={cn("h-full w-full overflow-visible", STROKE[tone])}
        role="img"
        aria-label="Trend"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {showBaseline && (
          <line
            x1="0"
            y1={H - 1}
            x2={W}
            y2={H - 1}
            className="stroke-border/40"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <path d={fillPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

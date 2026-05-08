"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import { lamportsToSolDisplay, useTreasuryFlow } from "@/lib/hooks/useTreasuryFlow";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Eye, HelpCircle, Lock, Minus, Shield } from "lucide-react";
import { MiniSparkline } from "./MiniSparkline";

/**
 * KPI strip rendered between the OverviewCard and the governance block on the
 * vault dashboard. Three cards, uniform layout:
 *
 *   1. Inflow 30d  — incoming SOL transfers, with delta and a 30-day sparkline.
 *   2. Outflow 30d — executed proposal totals, with inverted-color delta
 *      (a higher outflow renders red because it's typically the unwelcome
 *      direction for a treasury).
 *   3. Privacy share — % of outflow value routed through Cloak. Uses a
 *      segmented bar instead of a sparkline because the metric is a ratio,
 *      not a time series. This is the Aegis-only KPI; Squads cannot show it.
 *
 * Each card follows the same vertical hierarchy:
 *   eyebrow (label + period) → big mono value → secondary line → trend visual
 */
export function TreasuryFlowStrip({
  multisig,
  internalAddresses,
  onPrivacyHelpClick,
}: {
  multisig: string;
  /** Base58 PDAs the multisig owns (primary + every sub-vault). When provided,
   *  the KPI hook excludes intra-treasury moves from inflow/outflow. The parent
   *  dashboard owns the source of truth (`useVaultData`) and threads it down. */
  internalAddresses?: ReadonlySet<string> | undefined;
  /** Optional handler for the "?" affordance on the privacy share card. */
  onPrivacyHelpClick?: () => void;
}) {
  const flow = useTreasuryFlow(multisig, 30, internalAddresses);
  const { data: solPrice, isLoading: solPriceLoading } = useSolPrice();
  const usdPending = solPriceLoading && solPrice === undefined;

  if (flow.loading) {
    // Skeleton mirrors the asymmetric ribbon: 3-col / 3-col / 6-col.
    return (
      <div className="grid gap-3 lg:grid-cols-12">
        <div className="h-[148px] rounded-panel border border-border/60 bg-surface shimmer-bg lg:col-span-3" />
        <div className="h-[148px] rounded-panel border border-border/60 bg-surface shimmer-bg lg:col-span-3" />
        <div className="h-[148px] rounded-panel border border-border/60 bg-surface shimmer-bg lg:col-span-6" />
      </div>
    );
  }

  // SVG sparkline math is inherently float; convert each bucket from BigInt
  // to Number once at the boundary. Even with 30 days of 100M SOL/day, this
  // sits well inside Number precision range.
  const inflowSparkValues = flow.inflowSpark.map((b) => Number(b.lamports));
  const outflowSparkValues = flow.outflowSpark.map((b) => Number(b.lamports));
  const noOutflow = flow.outflowLamports === 0n;
  const noInflow = flow.inflowLamports === 0n;
  const inflowSol = bigIntLamportsToSolNumber(flow.inflowLamports);
  const outflowSol = bigIntLamportsToSolNumber(flow.outflowLamports);

  // Asymmetric grid (3/3/6): privacy share gets DOUBLE the column real
  // estate. The width imbalance is the message — the % shielded KPI is the
  // moat Squads cannot show, so it earns the headline slot.
  return (
    <div className="grid gap-3 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <FlowCard
          label="Inflow"
          period="Last 30 days"
          emptyTitle="No inflow yet"
          emptyDescription="Share the deposit address to start tracking."
          empty={noInflow}
          value={`+${lamportsToSolDisplay(flow.inflowLamports)}`}
          unit="SOL"
          usd={solPrice ? inflowSol * solPrice : null}
          usdPending={usdPending}
          delta={flow.inflowDelta}
          deltaTone={(d) => (d > 0 ? "positive" : d < 0 ? "danger" : "neutral")}
          sparkValues={inflowSparkValues}
          sparkTone="positive"
          sparkId={`inflow-${multisig.slice(0, 8)}`}
          icon={ArrowDownRight}
        />
      </div>
      <div className="lg:col-span-3">
        <FlowCard
          label="Outflow"
          period="Last 30 days"
          emptyTitle="No outflow yet"
          emptyDescription="Send your first payment to populate this view."
          empty={noOutflow}
          value={lamportsToSolDisplay(flow.outflowLamports)}
          unit="SOL"
          usd={solPrice ? outflowSol * solPrice : null}
          usdPending={usdPending}
          delta={flow.outflowDelta}
          // For outflow, growth is the unwelcome direction; tone inverts.
          deltaTone={(d) => (d > 0 ? "danger" : d < 0 ? "positive" : "neutral")}
          sparkValues={outflowSparkValues}
          sparkTone="muted"
          sparkId={`outflow-${multisig.slice(0, 8)}`}
          icon={ArrowUpRight}
        />
      </div>
      <div className="lg:col-span-6">
        <PrivacyShareCard
          share={flow.privacyShare}
          privateCount={flow.privateCount}
          publicCount={flow.publicCount}
          privateLamports={flow.privateOutflowLamports}
          publicLamports={flow.publicOutflowLamports}
          empty={noOutflow}
          {...(onPrivacyHelpClick ? { onHelpClick: onPrivacyHelpClick } : {})}
        />
      </div>
    </div>
  );
}

const LAMPORTS_PER_SOL_BIG = 1_000_000_000n;

function bigIntLamportsToSolNumber(lamports: bigint): number {
  const whole = Number(lamports / LAMPORTS_PER_SOL_BIG);
  const remainder = Number(lamports % LAMPORTS_PER_SOL_BIG) / 1_000_000_000;
  return whole + remainder;
}

type DeltaTone = "positive" | "danger" | "neutral";

/**
 * Format USD with adaptive precision so tiny devnet test amounts render
 * something readable instead of rounding to "$0".
 */
function formatUsd(value: number): string {
  if (value >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  // Sub-dollar amounts: keep two significant digits without scientific notation.
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function FlowCard({
  label,
  period,
  empty,
  emptyTitle,
  emptyDescription,
  value,
  unit,
  usd,
  usdPending,
  delta,
  deltaTone,
  sparkValues,
  sparkTone,
  sparkId,
  icon: Icon,
}: {
  label: string;
  period: string;
  empty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  value: string;
  unit: string;
  usd: number | null;
  usdPending: boolean;
  delta: number | null;
  deltaTone: (d: number) => DeltaTone;
  sparkValues: number[];
  sparkTone: "accent" | "positive" | "danger" | "muted";
  sparkId: string;
  icon: typeof ArrowUpRight;
}) {
  return (
    <div className="card-panel group relative flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-eyebrow text-ink-subtle">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {label}
            <span className="text-ink-subtle/60" aria-hidden="true">
              ·
            </span>
            <span className="text-ink-subtle/60 normal-case tracking-normal">{period}</span>
          </div>

          {empty ? (
            <div className="mt-3">
              <p className="font-display text-2xl font-semibold tracking-tight text-ink-subtle">
                {emptyTitle}
              </p>
              <p className="mt-1 text-xs text-ink-subtle">{emptyDescription}</p>
            </div>
          ) : (
            <>
              <div className="mt-2.5 flex items-baseline gap-1.5">
                <p className="font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
                  {value}
                </p>
                <span className="text-sm font-medium text-ink-subtle">{unit}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                {usdPending ? (
                  <Skeleton className="h-3 w-16 rounded" aria-label="Loading USD value" />
                ) : (
                  usd !== null &&
                  usd > 0 && (
                    <span className="tabular-nums text-ink-muted">≈ ${formatUsd(usd)}</span>
                  )
                )}
                {delta !== null ? <DeltaPill delta={delta} tone={deltaTone(delta)} /> : null}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-auto px-1 pb-1 pt-4">
        <MiniSparkline values={sparkValues} tone={sparkTone} fillId={sparkId} height={40} />
      </div>
    </div>
  );
}

function DeltaPill({ delta, tone }: { delta: number; tone: DeltaTone }) {
  const pct = Math.abs(delta * 100);
  const Icon = delta > 0.0001 ? ArrowUpRight : delta < -0.0001 ? ArrowDownRight : Minus;
  const colorClass =
    tone === "positive"
      ? "text-signal-positive"
      : tone === "danger"
        ? "text-signal-danger"
        : "text-ink-subtle";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", colorClass)}
        >
          <Icon className="h-3 w-3" aria-hidden="true" />
          {pct.toFixed(0)}%
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">Compared to the prior 30 days</TooltipContent>
    </Tooltip>
  );
}

function PrivacyShareCard({
  share,
  privateCount,
  publicCount,
  privateLamports,
  publicLamports,
  empty,
  onHelpClick,
}: {
  share: number | null;
  privateCount: number;
  publicCount: number;
  privateLamports: bigint;
  publicLamports: bigint;
  empty: boolean;
  onHelpClick?: () => void;
}) {
  const pct = share !== null ? Math.round(share * 100) : null;

  return (
    <div className="card-panel privacy-halo group relative flex h-full flex-col overflow-hidden">
      <div className="px-5 pt-5">
        {/* Eyebrow row — label + period + optional "?" */}
        <div className="flex items-center gap-1.5 text-eyebrow text-ink-subtle">
          <Shield className="h-3 w-3" aria-hidden="true" />
          Privacy share
          <span className="text-ink-subtle/60" aria-hidden="true">
            ·
          </span>
          <span className="text-ink-subtle/60 normal-case tracking-normal">Last 30 days</span>
          {onHelpClick && (
            <button
              type="button"
              onClick={onHelpClick}
              className="ml-auto flex h-4 w-4 items-center justify-center rounded-full text-ink-subtle/70 transition-aegis hover:bg-surface-2 hover:text-accent"
              aria-label="How privacy works"
              title="How privacy works"
            >
              <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>

        {empty ? (
          <div className="mt-3">
            <p className="font-display text-2xl font-semibold tracking-tight text-ink-subtle">
              Awaiting first outflow
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              Once you send a payment we'll show how much went private.
            </p>
          </div>
        ) : (
          <div className="mt-2.5 flex items-end justify-between gap-4">
            {/* Left — value stack */}
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-accent">
                  {pct}%
                </p>
                <span className="text-sm font-medium text-ink-subtle">shielded</span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                <span className="tabular-nums">{privateCount}</span> private
                <span className="px-1 text-ink-subtle/60" aria-hidden="true">
                  ·
                </span>
                <span className="tabular-nums">{publicCount}</span> public
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bar — full-width footer, mirrors how Inflow/Outflow place their
          sparkline at the bottom. Lives in the same card, no internal split. */}
      <div className="mt-auto px-5 pb-5 pt-4">
        <SegmentedBar
          privateLamports={privateLamports}
          publicLamports={publicLamports}
          empty={empty}
        />
      </div>
    </div>
  );
}

/**
 * Two-segment horizontal bar for privacy share. The private (accent) segment
 * sits on the left, the public (muted) segment on the right. We pad to 100%
 * with an empty muted track when there's no data so the bar slot doesn't
 * collapse and shift the card height.
 */
function SegmentedBar({
  privateLamports,
  publicLamports,
  empty,
}: {
  privateLamports: bigint;
  publicLamports: bigint;
  empty: boolean;
}) {
  const total = privateLamports + publicLamports;
  // Convert to Number AFTER the BigInt sum so the ratio computation is exact
  // for values within Number range. Pct is a display ratio, no precision risk.
  const privatePct = total > 0n ? (Number(privateLamports) / Number(total)) * 100 : 0;
  const publicPct = total > 0n ? (Number(publicLamports) / Number(total)) * 100 : 0;

  if (empty || total === 0n) {
    return <div className="h-2 w-full rounded-full bg-surface-2" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-accent"
          style={{ width: `${privatePct}%` }}
          aria-label={`Private ${privatePct.toFixed(0)}%`}
        />
        <div
          className="h-full bg-ink-subtle/50"
          style={{ width: `${publicPct}%` }}
          aria-label={`Public ${publicPct.toFixed(0)}%`}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-ink-subtle">
        <span className="inline-flex items-center gap-1">
          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
          Private
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye className="h-2.5 w-2.5" aria-hidden="true" />
          Public
        </span>
      </div>
    </div>
  );
}

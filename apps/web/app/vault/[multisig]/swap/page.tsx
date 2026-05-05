"use client";

import { TokenLogo } from "@/components/ui/token-logo";
import {
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { PriceChart } from "@/components/vault/PriceChart";
import { SwapHistory } from "@/components/vault/SwapHistory";
import { SwapPanel } from "@/components/vault/SwapPanel";
import { useSolChartData } from "@/lib/hooks/useSolChartData";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import { ArrowLeftRight, TrendingDown, TrendingUp } from "lucide-react";
import { use, useMemo, useState } from "react";

export default function SwapPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const { data: solPrice } = useSolPrice();
  const [chartDays, setChartDays] = useState(7);
  const { data: chartDataSelected, isLoading: chartLoading } = useSolChartData(chartDays);

  const priceChange = useMemo(() => {
    if (!chartDataSelected || chartDataSelected.length < 2) return null;
    const first = chartDataSelected[0]?.value ?? 0;
    const last = chartDataSelected[chartDataSelected.length - 1]?.value ?? 0;
    if (first === 0) return null;
    const change = ((last - first) / first) * 100;
    return { change, first, last };
  }, [chartDataSelected]);

  return (
    <WorkspacePage>
      <div className="space-y-6">
        <WorkspaceHeader
          eyebrow="SWAP"
          title={
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-2">
                <TokenLogo symbol="SOL" size={28} />
                <span className="text-ink">SOL</span>
              </span>
              <span className="text-ink-subtle/40">/</span>
              <span className="flex items-center gap-2">
                <TokenLogo symbol="USDC" size={28} />
                <span className="text-ink">USDC</span>
              </span>
            </span>
          }
          description="Swap between SOL and USDC through your Squads vault. Creates a multisig proposal for signer approval."
        />

        <div className="grid gap-6 lg:grid-cols-[480px_1fr]">
          {/* Left: Swap Panel */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <Panel>
              <PanelHeader
                icon={ArrowLeftRight}
                title="Swap"
                description="SOL ↔ USDC via Orca"
              />
              <PanelBody>
                <SwapPanel multisig={multisig} />
              </PanelBody>
            </Panel>
          </div>

          {/* Right: Chart + History */}
          <div className="space-y-4">
            <Panel>
              <PanelHeader
                icon={ArrowLeftRight}
                title="SOL / USDC"
                description="Price chart powered by CoinGecko"
                action={
                  <div className="flex items-center gap-4">
                    {solPrice != null && (
                      <span className="font-display text-lg font-semibold tabular-nums text-ink">
                        $
                        {solPrice.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                    {priceChange && (
                      <span
                        className={`flex items-center gap-1 text-sm font-medium ${
                          priceChange.change >= 0 ? "text-signal-positive" : "text-signal-danger"
                        }`}
                      >
                        {priceChange.change >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {priceChange.change >= 0 ? "+" : ""}
                        {priceChange.change.toFixed(2)}%
                      </span>
                    )}
                  </div>
                }
              />
              <PanelBody className="p-0">
                <PriceChart data={chartDataSelected ?? []} loading={chartLoading} />
              </PanelBody>
            </Panel>

            {/* Time range selector */}
            <div className="flex items-center justify-center gap-2 px-4">
              {[1, 7, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setChartDays(d)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    chartDays === d
                      ? "bg-accent-soft text-accent"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {d === 1 ? "1D" : d === 7 ? "7D" : "30D"}
                </button>
              ))}
            </div>

            {/* Swap History */}
            <SwapHistory multisig={multisig} />
          </div>
        </div>
      </div>
    </WorkspacePage>
  );
}

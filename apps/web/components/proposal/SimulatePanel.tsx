"use client";

import { Panel, PanelBody, PanelHeader, StatusPill } from "@/components/ui/workspace";
import type { SimulationResult } from "@/lib/proposal-simulator";
import { lamportsToSol } from "@/lib/sol";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2 } from "lucide-react";

export function SimulatePanel({ result }: { result: SimulationResult }) {
  const movedDeltas = result.balanceDeltas.filter((d) => d.delta !== 0);

  return (
    <Panel>
      <PanelHeader
        icon={result.ok ? CheckCircle2 : AlertTriangle}
        title={result.ok ? "Simulation passed" : "Simulation failed"}
        description="On-chain effect of the multisig execution. Operator-side Cloak deposit (if private) runs as a separate transaction."
        action={
          <StatusPill tone={result.ok ? "success" : "danger"}>
            {result.ok ? "OK" : "Error"}
          </StatusPill>
        }
      />
      <PanelBody className="space-y-4">
        {result.err && (
          <div className="rounded-md border border-signal-danger/30 bg-signal-danger/5 p-3 font-mono text-xs text-signal-danger">
            {result.err}
          </div>
        )}

        {movedDeltas.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              Balance changes
            </p>
            <ul className="space-y-1.5">
              {movedDeltas.map((d) => (
                <li
                  key={d.address}
                  className="flex items-center justify-between rounded-md bg-surface-2/50 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-ink-muted">
                    {d.address.slice(0, 8)}…{d.address.slice(-6)}
                  </span>
                  <span
                    className={`flex items-center gap-1 font-mono tabular-nums ${
                      d.delta > 0 ? "text-signal-positive" : "text-signal-danger"
                    }`}
                  >
                    {d.delta > 0 ? (
                      <ArrowDownRight className="h-3 w-3" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" />
                    )}
                    {d.delta > 0 ? "+" : "-"}
                    {lamportsToSol(Math.abs(d.delta))} SOL
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.computeUnits != null && (
          <div className="text-xs text-ink-subtle">
            Compute units: {result.computeUnits.toLocaleString()} / 1,400,000 (
            {(result.unitsConsumedFraction * 100).toFixed(1)}%)
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-ink-muted hover:text-ink">
            Instruction logs ({result.logs.length})
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-bg/50 p-3 font-mono text-[10px] text-ink-subtle">
            {result.logs.join("\n")}
          </pre>
        </details>
      </PanelBody>
    </Panel>
  );
}

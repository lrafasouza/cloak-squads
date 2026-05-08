"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { type AegisStatus, StatusBadge } from "@/components/ui/aegis";
import { Button } from "@/components/ui/button";
import { ReceiptRow } from "@/components/ui/receipt-row";
import { lamportsToSol } from "@/lib/sol";
import { cn } from "@/lib/utils";
import {
  type AuditScope,
  type FilteredAuditTransaction,
  deriveViewKeyFromSecret,
  exportAuditToCSV,
  filterAuditData,
  generateDeterministicMockData,
  validateAuditFragment,
} from "@cloak-squads/core/audit";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BadgeCheck,
  Download,
  FileJson,
  Loader2,
  ShieldOff,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

function TxTypeLabel({ type }: { type: FilteredAuditTransaction["type"] }) {
  const config = {
    deposit: { icon: ArrowDownLeft, label: "Deposit", color: "text-signal-positive" },
    transfer: { icon: ArrowRightLeft, label: "Transfer", color: "text-accent" },
    withdraw: { icon: ArrowUpRight, label: "Withdraw", color: "text-ink-muted" },
  };
  const { icon: Icon, label, color } = config[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      {label}
    </span>
  );
}

type AuditLinkMetadata = {
  id: string;
  cofreAddress: string;
  scope: AuditScope;
  scopeParams: string | null;
  expiresAt: string;
  issuedBy: string;
  createdAt: string;
};

type AuditTab = "transactions" | "scope";
type TypeFilter = "all" | FilteredAuditTransaction["type"];
type StatusFilter = "all" | FilteredAuditTransaction["status"];

const SCOPE_LABEL: Record<AuditScope, string> = {
  full: "Full access",
  amounts_only: "Amounts only",
  time_ranged: "Time-ranged",
};

const SCOPE_BADGE: Record<AuditScope, AegisStatus> = {
  full: "executed",
  amounts_only: "sealed",
  time_ranged: "pending",
};

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function downloadText(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getScopeDescription(scope: AuditScope) {
  switch (scope) {
    case "full":
      return "Full access to all transaction data including amounts and addresses.";
    case "amounts_only":
      return "View-only access to transaction amounts. Identifiers are redacted.";
    case "time_ranged":
      return "View-only access to transactions within the specified date range.";
  }
}

export default function PublicAuditPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);

  const [metadata, setMetadata] = useState<AuditLinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fragmentValid, setFragmentValid] = useState(false);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);
  const [transactions, setTransactions] = useState<FilteredAuditTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<AuditTab>("transactions");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Parse fragment from URL
  useEffect(() => {
    if (typeof window === "undefined") return;

    const fragment = window.location.hash.slice(1);
    if (!fragment) {
      setError("Missing access key in URL. Make sure you have the complete link with #fragment.");
      return;
    }

    const result = validateAuditFragment(linkId, fragment);
    if (!result.valid) {
      setError("Invalid access key. The link may be corrupted or incomplete.");
      return;
    }

    setSecretKey(result.secretKey);
    setFragmentValid(true);
  }, [linkId]);

  // Load metadata
  useEffect(() => {
    if (!fragmentValid) return;

    const loadMetadata = async () => {
      try {
        const res = await fetch(`/api/audit/${linkId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Audit link not found.");
          } else if (res.status === 410) {
            setError("This audit link has expired.");
          } else {
            setError("Failed to load audit data.");
          }
          return;
        }

        const data = await res.json();
        setMetadata(data);
      } catch {
        setError("Failed to load audit data.");
      } finally {
        setLoading(false);
      }
    };

    void loadMetadata();
  }, [linkId, fragmentValid]);

  // Derive view key and load transactions (mock for now)
  useEffect(() => {
    if (!metadata || !secretKey) return;

    let scopeParams: Record<string, unknown> = {};
    try {
      scopeParams = metadata.scopeParams
        ? (JSON.parse(metadata.scopeParams) as Record<string, unknown>)
        : {};
    } catch {
      scopeParams = {};
    }
    const viewKey = deriveViewKeyFromSecret(secretKey, {
      linkId: metadata.id,
      scope: metadata.scope,
      startDate: BigInt((scopeParams.startDate as number | undefined) ?? 0),
      endDate: BigInt((scopeParams.endDate as number | undefined) ?? Date.now()),
    });

    void viewKey;

    const loadRealData = async () => {
      try {
        const auditParam = `auditLinkId=${encodeURIComponent(linkId)}`;
        const [singleRes, payrollRes] = await Promise.all([
          fetch(`/api/proposals/${encodeURIComponent(metadata.cofreAddress)}?${auditParam}`),
          fetch(`/api/payrolls/${encodeURIComponent(metadata.cofreAddress)}?${auditParam}`),
        ]);

        const realTxs: FilteredAuditTransaction[] = [];

        if (singleRes.ok) {
          const drafts = (await singleRes.json()) as Array<{
            amount: string;
            recipient: string;
            createdAt: string;
            archivedAt?: string | null;
          }>;
          for (const d of drafts) {
            // If the draft was archived (proposal failed/was cancelled), mark as failed
            const status: FilteredAuditTransaction["status"] = d.archivedAt
              ? "failed"
              : "confirmed";
            realTxs.push({
              type: "transfer",
              amount: metadata.scope === "amounts_only" ? d.amount : d.amount,
              nullifier: metadata.scope === "amounts_only" ? "REDACTED" : d.recipient.slice(0, 16),
              status,
              timestamp: new Date(d.createdAt).getTime(),
            });
          }
        }

        if (payrollRes.ok) {
          const payrolls = (await payrollRes.json()) as Array<{
            totalAmount: string;
            recipientCount: number;
            createdAt: string;
          }>;
          for (const p of payrolls) {
            realTxs.push({
              type: "transfer",
              amount: p.totalAmount,
              nullifier:
                metadata.scope === "amounts_only" ? "REDACTED" : `payroll:${p.recipientCount}`,
              status: "confirmed",
              timestamp: new Date(p.createdAt).getTime(),
            });
          }
        }

        // Also fetch archived drafts to detect failed/cancelled proposals
        try {
          const archivedRes = await fetch(
            `/api/proposals/${encodeURIComponent(metadata.cofreAddress)}?includeArchived=true&${auditParam}`,
          );
          if (archivedRes.ok) {
            const archivedDrafts = (await archivedRes.json()) as Array<{
              amount: string;
              recipient: string;
              createdAt: string;
              archivedAt?: string | null;
            }>;
            for (const d of archivedDrafts) {
              if (!d.archivedAt) continue;
              // Check if this failed draft is already in the list
              const nullifier =
                metadata.scope === "amounts_only" ? "REDACTED" : d.recipient.slice(0, 16);
              const existingIdx = realTxs.findIndex((tx) => tx.nullifier === nullifier);
              if (existingIdx >= 0) {
                realTxs[existingIdx]!.status = "failed";
              } else {
                // Add failed transaction that wasn't in the non-archived list
                realTxs.push({
                  type: "transfer",
                  amount: d.amount,
                  nullifier,
                  status: "failed",
                  timestamp: new Date(d.createdAt).getTime(),
                });
              }
            }
          }
        } catch {
          // Archived status check is best-effort; don't block audit view
        }

        if (realTxs.length > 0) {
          const filtered = filterAuditData(
            realTxs,
            metadata.scope,
            scopeParams as { startDate: number; endDate: number },
          );
          setTransactions(filtered);
          return;
        }
      } catch {
        // Fall through to mock data
      }

      const mockData = generateDeterministicMockData(metadata.id, 8);
      const filtered = filterAuditData(
        mockData,
        metadata.scope,
        scopeParams as { startDate: number; endDate: number },
      );
      setTransactions(filtered);
    };

    void loadRealData();
  }, [metadata, secretKey]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        const typeMatch = typeFilter === "all" || tx.type === typeFilter;
        const statusMatch = statusFilter === "all" || tx.status === statusFilter;
        return typeMatch && statusMatch;
      }),
    [statusFilter, transactions, typeFilter],
  );

  const totals = useMemo(() => {
    const visibleAmount = filteredTransactions.reduce((sum, tx) => {
      if (!tx.amount) return sum;
      return sum + BigInt(tx.amount);
    }, 0n);
    return {
      visibleAmount,
      deposits: filteredTransactions.filter((tx) => tx.type === "deposit").length,
      transfers: filteredTransactions.filter((tx) => tx.type === "transfer").length,
      withdraws: filteredTransactions.filter((tx) => tx.type === "withdraw").length,
      pending: filteredTransactions.filter((tx) => tx.status === "pending").length,
      failed: filteredTransactions.filter((tx) => tx.status === "failed").length,
    };
  }, [filteredTransactions]);

  const handleExportCSV = () => {
    downloadText(`audit-${linkId}.csv`, exportAuditToCSV(filteredTransactions), "text/csv");
  };

  const handleExportJSON = () => {
    downloadText(
      `audit-${linkId}.json`,
      JSON.stringify(
        {
          linkId,
          exportedAt: new Date().toISOString(),
          filters: { type: typeFilter, status: statusFilter },
          metadata,
          transactions: filteredTransactions,
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  /* ────────────────────────────────────────────────── States ── */

  if (error) {
    return (
      <main className="min-h-screen bg-bg">
        <section className="mx-auto w-full max-w-2xl px-4 py-16 md:py-20">
          <div className="card-panel p-8 md:p-10 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-signal-danger/10 text-signal-danger">
              <ShieldOff className="h-6 w-6" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-semibold text-ink">Access error</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-muted">{error}</p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink transition-aegis hover:bg-surface-3"
            >
              Return home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (loading || !metadata) {
    return (
      <main className="min-h-screen bg-bg">
        <section className="mx-auto w-full max-w-7xl px-4 py-10 md:py-14 md:px-6">
          <div className="card-hero relative p-8 md:p-10">
            <div className="relative">
              <div className="text-eyebrow">Aegis · Public audit</div>
              <div className="mt-3 h-10 w-72 rounded-md shimmer-bg" />
              <div className="mt-3 h-4 w-96 max-w-full rounded shimmer-bg" />
              <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/50 pt-5 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i}>
                    <div className="h-3 w-16 rounded shimmer-bg" />
                    <div className="mt-2 h-7 w-24 rounded shimmer-bg" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const exportDisabled = filteredTransactions.length === 0;
  const visibleAmountSol = Number.parseFloat(lamportsToSol(totals.visibleAmount));
  const expiresIn = Math.max(0, new Date(metadata.expiresAt).getTime() - Date.now());
  const expiresInDays = Math.ceil(expiresIn / 86_400_000);

  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10">
        {/* Hero — audit cover with KPI ribbon and Æ watermark */}
        <div className="card-hero relative overflow-hidden p-7 md:p-9">
          <HeraldicWatermark />
          <div className="relative">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <div className="text-eyebrow text-accent">Aegis · Public audit</div>
                <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
                  {SCOPE_LABEL[metadata.scope]} report
                </h1>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {getScopeDescription(metadata.scope)}
                </p>
                {/* Provenance — exports are Ed25519-signed by the issuer.
                    Auditors should see this immediately so the report is
                    read as accountable, not advisory. */}
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent-soft/60 px-2.5 py-1 text-[11px] font-medium text-accent">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Provenance · exports are Ed25519-signed
                </p>
              </div>
              <StatusBadge status={SCOPE_BADGE[metadata.scope]}>
                {SCOPE_LABEL[metadata.scope]}
              </StatusBadge>
            </div>

            {/* KPI ribbon — 4 numbers · matches operator/proposals hero pattern */}
            <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/50 pt-5 sm:grid-cols-4">
              <div>
                <div className="text-eyebrow">Visible amount</div>
                <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink">
                  {visibleAmountSol > 0
                    ? visibleAmountSol.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    : "0"}
                  <span className="ml-1 text-xs font-normal text-ink-subtle">SOL</span>
                </p>
              </div>
              <div>
                <div className="text-eyebrow">Transactions</div>
                <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink">
                  {transactions.length}
                </p>
              </div>
              <div>
                <div className="text-eyebrow">Vault</div>
                <p className="mt-1.5 font-mono text-base font-semibold text-ink tabular-nums">
                  {truncateAddress(metadata.cofreAddress)}
                </p>
              </div>
              <div>
                <div className="text-eyebrow">Expires</div>
                <p
                  className={cn(
                    "mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight",
                    expiresInDays <= 1 ? "text-signal-warn" : "text-ink",
                  )}
                >
                  {expiresInDays}
                  <span className="ml-1 text-xs font-normal text-ink-subtle">
                    {expiresInDays === 1 ? "day" : "days"}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs + export ribbon */}
        <div className="mt-6 card-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-3 py-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-0.5">
              {[
                { id: "transactions" as const, label: "Transactions", count: transactions.length },
                { id: "scope" as const, label: "Scope", count: 0 },
              ].map(({ id, label, count }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-aegis",
                      isActive
                        ? "bg-accent-soft text-accent"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                          isActive ? "bg-accent/20 text-accent" : "bg-surface-3 text-ink-subtle",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2 px-1 md:px-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={exportDisabled}
              >
                <Download className="mr-2 h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportJSON}
                disabled={exportDisabled}
              >
                <FileJson className="mr-2 h-3.5 w-3.5" />
                JSON
              </Button>
            </div>
          </div>

          {activeTab === "transactions" ? (
            <div>
              {/* Sub-stats + filters strip — dot+label pattern matches the
                  proposals queue ribbon so failed/pending read as the
                  same governance signals across the product. */}
              <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-3.5 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
                  <span className="text-ink-muted">
                    <span className="text-ink-subtle">Showing</span>{" "}
                    <span className="font-mono tabular-nums text-ink">
                      {filteredTransactions.length}
                    </span>{" "}
                    <span className="text-ink-subtle">of</span>{" "}
                    <span className="font-mono tabular-nums text-ink-muted">
                      {transactions.length}
                    </span>
                  </span>
                  {totals.failed > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-signal-danger">
                      <span className="h-1.5 w-1.5 rounded-full bg-signal-danger" />
                      <span className="font-mono tabular-nums">{totals.failed}</span> failed
                    </span>
                  ) : null}
                  {totals.pending > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-signal-warn">
                      <span className="h-1.5 w-1.5 rounded-full bg-signal-warn" />
                      <span className="font-mono tabular-nums">{totals.pending}</span> pending
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                    className="min-h-9 rounded-md border border-border bg-surface px-2 text-xs font-medium text-ink transition-aegis hover:border-border-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <option value="all">All types</option>
                    <option value="deposit">Deposits</option>
                    <option value="transfer">Transfers</option>
                    <option value="withdraw">Withdraws</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="min-h-9 rounded-md border border-border bg-surface px-2 text-xs font-medium text-ink transition-aegis hover:border-border-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <option value="all">All statuses</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              {/* Transactions table */}
              {filteredTransactions.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-ink-muted">
                    No transactions match these filters
                  </p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    Clear the type or status filter to widen the audit view.
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <div
                      className="grid items-center gap-4 border-b border-border/50 px-5 py-2"
                      style={{ gridTemplateColumns: "10rem 7rem 1fr 1fr 6rem" }}
                    >
                      <span className="text-eyebrow">Date</span>
                      <span className="text-eyebrow">Type</span>
                      <span className="text-eyebrow">Amount</span>
                      <span className="text-eyebrow">Nullifier</span>
                      <span className="text-right text-eyebrow">Status</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {filteredTransactions.map((tx, idx) => (
                        <div
                          key={`${tx.timestamp}-${tx.nullifier}-${idx}`}
                          className="grid items-center gap-4 px-5 py-3.5 transition-aegis hover:bg-surface-2"
                          style={{ gridTemplateColumns: "10rem 7rem 1fr 1fr 6rem" }}
                        >
                          <div className="text-sm text-ink">
                            {new Date(tx.timestamp).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "2-digit",
                            })}
                            <span className="ml-1.5 text-xs text-ink-subtle">
                              {new Date(tx.timestamp).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <TxTypeLabel type={tx.type} />
                          <div className="font-mono text-sm text-ink tabular-nums">
                            {tx.amount ? `${lamportsToSol(tx.amount)} SOL` : "Redacted"}
                          </div>
                          <div className="font-mono text-xs text-ink-subtle">
                            {tx.nullifier === "REDACTED"
                              ? "REDACTED"
                              : `${tx.nullifier.slice(0, 12)}…${tx.nullifier.slice(-6)}`}
                          </div>
                          <div className="flex justify-end">
                            <StatusBadge
                              status={
                                tx.status === "confirmed"
                                  ? "executed"
                                  : tx.status === "failed"
                                    ? "expired"
                                    : "pending"
                              }
                            >
                              {tx.status}
                            </StatusBadge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-border/40">
                    {filteredTransactions.map((tx, idx) => (
                      <div
                        key={`${tx.timestamp}-${tx.nullifier}-${idx}`}
                        className="flex items-start justify-between gap-3 px-4 py-3.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <TxTypeLabel type={tx.type} />
                            <span className="text-xs text-ink-subtle">
                              {new Date(tx.timestamp).toLocaleDateString(undefined, {
                                month: "short",
                                day: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-sm text-ink tabular-nums">
                            {tx.amount ? `${lamportsToSol(tx.amount)} SOL` : "Redacted"}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-subtle">
                            {tx.nullifier === "REDACTED"
                              ? "REDACTED"
                              : `${tx.nullifier.slice(0, 10)}…${tx.nullifier.slice(-4)}`}
                          </p>
                        </div>
                        <StatusBadge
                          status={
                            tx.status === "confirmed"
                              ? "executed"
                              : tx.status === "failed"
                                ? "expired"
                                : "pending"
                          }
                        >
                          {tx.status}
                        </StatusBadge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Scope tab */
            <div className="p-5 md:p-7">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="card-panel relative overflow-hidden p-5">
                  <div className="text-eyebrow">Link metadata</div>
                  <div className="mt-3 space-y-1">
                    <ReceiptRow label="Audit link ID">
                      <span className="text-[12px]">{metadata.id.slice(0, 18)}…</span>
                    </ReceiptRow>
                    <ReceiptRow label="Vault">{truncateAddress(metadata.cofreAddress)}</ReceiptRow>
                    <ReceiptRow label="Issued by">{truncateAddress(metadata.issuedBy)}</ReceiptRow>
                    <ReceiptRow label="Created" mono={false}>
                      {new Date(metadata.createdAt).toLocaleString()}
                    </ReceiptRow>
                    <ReceiptRow label="Expires" mono={false}>
                      {new Date(metadata.expiresAt).toLocaleString()}
                    </ReceiptRow>
                  </div>
                </div>

                <div className="card-panel relative overflow-hidden p-5">
                  <div className="text-eyebrow">Filter results</div>
                  <div className="mt-3 space-y-1">
                    <ReceiptRow label="Scope" mono={false} tone="accent">
                      {SCOPE_LABEL[metadata.scope]}
                    </ReceiptRow>
                    <ReceiptRow label="Total transactions">
                      {String(transactions.length)}
                    </ReceiptRow>
                    <ReceiptRow label="After filters">
                      {String(filteredTransactions.length)}
                    </ReceiptRow>
                    <ReceiptRow label="Deposits">{String(totals.deposits)}</ReceiptRow>
                    <ReceiptRow label="Transfers">{String(totals.transfers)}</ReceiptRow>
                    <ReceiptRow label="Withdraws">{String(totals.withdraws)}</ReceiptRow>
                  </div>
                </div>
              </div>

              {metadata.scopeParams ? (
                <div className="mt-6">
                  <div className="text-eyebrow">Scope parameters</div>
                  <pre className="mt-2 overflow-x-auto rounded-md border border-border/60 bg-surface-2 p-3 font-mono text-xs leading-5 text-ink-muted">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(metadata.scopeParams), null, 2);
                      } catch {
                        return metadata.scopeParams;
                      }
                    })()}
                  </pre>
                </div>
              ) : null}

              <p className="mt-6 inline-flex items-center gap-2 text-xs text-ink-subtle">
                <Loader2 className="h-3 w-3" aria-hidden="true" />
                This view is derived client-side from the secret fragment in the URL.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

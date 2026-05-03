"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyPanel,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
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
  Download,
  FileJson,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

function TxTypeLabel({ type }: { type: FilteredAuditTransaction["type"] }) {
  const config = {
    deposit: { icon: ArrowDownLeft, label: "Deposit", color: "text-accent" },
    transfer: { icon: ArrowRightLeft, label: "Transfer", color: "text-ink-muted" },
    withdraw: { icon: ArrowUpRight, label: "Withdraw", color: "text-ink-muted" },
  };
  const { icon: Icon, label, color } = config[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink">
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

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
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

function scopeTone(scope: AuditScope): "accent" | "neutral" | "warning" {
  if (scope === "full") return "accent";
  if (scope === "time_ranged") return "warning";
  return "neutral";
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
        const [singleRes, payrollRes] = await Promise.all([
          fetch(`/api/proposals/${encodeURIComponent(metadata.cofreAddress)}`),
          fetch(`/api/payrolls/${encodeURIComponent(metadata.cofreAddress)}`),
        ]);

        const realTxs: FilteredAuditTransaction[] = [];

        if (singleRes.ok) {
          const drafts = (await singleRes.json()) as Array<{ amount: string; recipient: string; createdAt: string; archivedAt?: string | null }>;
          for (const d of drafts) {
            // If the draft was archived (proposal failed/was cancelled), mark as failed
            const status: FilteredAuditTransaction["status"] = d.archivedAt ? "failed" : "confirmed";
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
          const payrolls = (await payrollRes.json()) as Array<{ totalAmount: string; recipientCount: number; createdAt: string }>;
          for (const p of payrolls) {
            realTxs.push({
              type: "transfer",
              amount: p.totalAmount,
              nullifier: metadata.scope === "amounts_only" ? "REDACTED" : `payroll:${p.recipientCount}`,
              status: "confirmed",
              timestamp: new Date(p.createdAt).getTime(),
            });
          }
        }

        // Also fetch archived drafts to detect failed/cancelled proposals
        try {
          const archivedRes = await fetch(`/api/proposals/${encodeURIComponent(metadata.cofreAddress)}?includeArchived=true`);
          if (archivedRes.ok) {
            const archivedDrafts = (await archivedRes.json()) as Array<{ amount: string; recipient: string; createdAt: string; archivedAt?: string | null }>;
            for (const d of archivedDrafts) {
              if (!d.archivedAt) continue;
              // Check if this failed draft is already in the list
              const nullifier = metadata.scope === "amounts_only" ? "REDACTED" : d.recipient.slice(0, 16);
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

  const getScopeDescription = (scope: AuditScope) => {
    switch (scope) {
      case "full":
        return "Full access to all transaction data including amounts and addresses.";
      case "amounts_only":
        return "View-only access to transaction amounts. Identifiers are redacted.";
      case "time_ranged":
        return "View-only access to transactions within the specified date range.";
    }
  };

  if (error) {
    return (
      <main className="min-h-screen bg-bg">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-lg border border-border-strong p-8">
            <h1 className="text-xl font-semibold text-ink">Access error</h1>
            <p className="mt-4 text-ink-muted">{error}</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-surface-2 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3"
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
      <WorkspacePage>
        <p className="text-ink-muted">Loading audit data...</p>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="Public audit view"
        title="Audit report"
        description={getScopeDescription(metadata.scope)}
        action={<StatusPill tone={scopeTone(metadata.scope)}>{metadata.scope}</StatusPill>}
      />

      <div className="grid gap-4">
        <Panel>
          <PanelBody>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                  Vault
                </dt>
                <dd className="mt-1 font-mono text-ink">
                  {truncateAddress(metadata.cofreAddress)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                  Issued by
                </dt>
                <dd className="mt-1 font-mono text-ink">{truncateAddress(metadata.issuedBy)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                  Visible amount
                </dt>
                <dd className="mt-1 font-mono text-ink">
                  {lamportsToSol(totals.visibleAmount)} SOL
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                  Expires
                </dt>
                <dd className="mt-1 text-ink">{new Date(metadata.expiresAt).toLocaleString()}</dd>
              </div>
            </dl>
          </PanelBody>
        </Panel>

        <Tabs
          defaultValue="transactions"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as AuditTab)}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <TabsList>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="scope">Scope</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={filteredTransactions.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportJSON}
                disabled={filteredTransactions.length === 0}
              >
                <FileJson className="mr-2 h-4 w-4" />
                Export JSON
              </Button>
            </div>
          </div>

          <TabsContent value="transactions">
            <Panel>
              <PanelHeader
                icon={ShieldCheck}
                title="Transactions"
                description={`${filteredTransactions.length} of ${transactions.length} transactions visible with the current filters.`}
                action={
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={typeFilter}
                      onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                      className="min-h-9 rounded-md border border-border bg-surface px-2 text-xs font-medium text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      <option value="all">All types</option>
                      <option value="deposit">Deposits</option>
                      <option value="transfer">Transfers</option>
                      <option value="withdraw">Withdraws</option>
                    </select>
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                      className="min-h-9 rounded-md border border-border bg-surface px-2 text-xs font-medium text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      <option value="all">All statuses</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                }
              />
              <PanelBody>
                <div className="mb-6 grid gap-4 sm:grid-cols-5">
                  <div>
                    <p className="text-xs font-medium text-ink-subtle">Deposits</p>
                    <p className="mt-1 font-mono text-xl font-semibold text-ink">
                      {totals.deposits}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-ink-subtle">Transfers</p>
                    <p className="mt-1 font-mono text-xl font-semibold text-ink">
                      {totals.transfers}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-ink-subtle">Withdraws</p>
                    <p className="mt-1 font-mono text-xl font-semibold text-ink">
                      {totals.withdraws}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-ink-subtle">Pending</p>
                    <p className="mt-1 font-mono text-xl font-semibold text-ink">
                      {totals.pending}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-ink-subtle">Failed</p>
                    <p className="mt-1 font-mono text-xl font-semibold text-signal-danger">
                      {totals.failed}
                    </p>
                  </div>
                </div>

                {filteredTransactions.length === 0 ? (
                  <EmptyPanel
                    title="No transactions match these filters"
                    description="Clear the type or status filter to widen the audit view."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                            Date
                          </th>
                          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                            Type
                          </th>
                          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                            Amount
                          </th>
                          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                            Nullifier
                          </th>
                          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((tx) => (
                          <tr
                            key={tx.nullifier}
                            className="border-b border-border/20 transition-colors last:border-b-0 hover:bg-surface-2/30"
                          >
                            <td className="px-5 py-3.5 whitespace-nowrap text-ink">
                              {new Date(tx.timestamp).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "2-digit",
                              })}{" "}
                              <span className="text-ink-subtle">
                                {new Date(tx.timestamp).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <TxTypeLabel type={tx.type} />
                            </td>
                            <td className="px-5 py-3.5 font-mono text-ink">
                              {tx.amount ? `${lamportsToSol(tx.amount)} SOL` : "Redacted"}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs text-ink-subtle">
                              {tx.nullifier === "REDACTED"
                                ? "REDACTED"
                                : `${tx.nullifier.slice(0, 12)}...${tx.nullifier.slice(-6)}`}
                            </td>
                            <td className="px-5 py-3.5">
                              <StatusPill tone={tx.status === "confirmed" ? "success" : tx.status === "failed" ? "danger" : "warning"}>
                                {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                              </StatusPill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PanelBody>
            </Panel>
          </TabsContent>

          <TabsContent value="scope">
            <Panel>
              <PanelHeader
                title="Scope and link metadata"
                description="This view is derived client-side from the secret fragment in the URL."
              />
              <PanelBody>
                <dl className="grid gap-4 md:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                      Audit link ID
                    </dt>
                    <dd className="mt-1 break-all font-mono text-sm text-ink">{metadata.id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                      Created
                    </dt>
                    <dd className="mt-1 text-sm text-ink">
                      {new Date(metadata.createdAt).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                      Scope
                    </dt>
                    <dd className="mt-1 text-sm text-ink">{metadata.scope}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                      Transaction counts
                    </dt>
                    <dd className="mt-1 text-sm text-ink">
                      {transactions.length} total, {filteredTransactions.length} after filters
                    </dd>
                  </div>
                </dl>

                {metadata.scopeParams ? (
                  <div className="mt-4">
                    <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                      Scope parameters
                    </dt>
                    <dd className="mt-1 rounded-md border border-border bg-bg p-3 font-mono text-xs text-ink-muted">
                      {metadata.scopeParams}
                    </dd>
                  </div>
                ) : null}
              </PanelBody>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </WorkspacePage>
  );
}

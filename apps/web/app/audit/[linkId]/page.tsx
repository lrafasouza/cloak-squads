"use client";

import {
  type AuditScope,
  type FilteredAuditTransaction,
  deriveViewKeyFromSecret,
  exportAuditToCSV,
  filterAuditData,
  generateDeterministicMockData,
  validateAuditFragment,
} from "@cloak-squads/core/audit";
import Link from "next/link";
import { use, useEffect, useState } from "react";

type AuditLinkMetadata = {
  id: string;
  cofreAddress: string;
  scope: AuditScope;
  scopeParams: string | null;
  expiresAt: string;
  issuedBy: string;
  createdAt: string;
};

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function PublicAuditPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);

  const [metadata, setMetadata] = useState<AuditLinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fragmentValid, setFragmentValid] = useState(false);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);
  const [transactions, setTransactions] = useState<FilteredAuditTransaction[]>([]);

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

    // Derive view key from secret
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

    console.log("Derived view key:", Buffer.from(viewKey).toString("hex"));

    // TODO: Fetch actual transactions from Cloak scan using viewKey
    // For now, show deterministic mock data based on linkId
    const mockData = generateDeterministicMockData(metadata.id, 8);

    const filtered = filterAuditData(
      mockData,
      metadata.scope,
      scopeParams as { startDate: number; endDate: number },
    );
    setTransactions(filtered);
  }, [metadata, secretKey]);

  const handleExportCSV = () => {
    const csv = exportAuditToCSV(transactions);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${linkId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getScopeDescription = (scope: AuditScope) => {
    switch (scope) {
      case "full":
        return "Full access to all transaction data including amounts and addresses.";
      case "amounts_only":
        return "View-only access to transaction amounts. Addresses are redacted.";
      case "time_ranged":
        return "View-only access to transactions within the specified date range.";
    }
  };

  const getScopeBadge = (scope: AuditScope) => {
    switch (scope) {
      case "full":
        return "bg-accent-soft text-accent";
      case "amounts_only":
        return "bg-blue-900 text-blue-200";
      case "time_ranged":
        return "bg-amber-900 text-amber-200";
    }
  };

  if (error) {
    return (
      <main className="min-h-screen bg-bg">
        <header className="border-b border-border bg-bg/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Aegis
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-8">
            <h1 className="text-xl font-semibold text-red-200">Access Error</h1>
            <p className="mt-4 text-neutral-300">{error}</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-surface-2 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-surface-3"
            >
              Return Home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (loading || !metadata) {
    return (
      <main className="min-h-screen bg-bg">
        <header className="border-b border-border bg-bg/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Aegis
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-ink-muted">Loading audit data...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="rounded-md text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Aegis
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-accent">Public Audit View</p>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${getScopeBadge(metadata.scope)}`}
              >
                {metadata.scope}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Audit Report</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">
              {getScopeDescription(metadata.scope)}
            </p>
          </div>

          <div className="flex flex-col gap-2 text-right">
            <p className="text-sm text-ink-subtle">
              Vault: {truncateAddress(metadata.cofreAddress)}
            </p>
            <p className="text-sm text-ink-subtle">
              Issued by: {truncateAddress(metadata.issuedBy)}
            </p>
            <p className="text-sm text-ink-subtle">
              Expires: {new Date(metadata.expiresAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Transactions Table */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Transactions</h2>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={transactions.length === 0}
              className="rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:bg-surface-3 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-surface p-8 text-center">
              <p className="text-ink-muted">No transactions found for this audit scope.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="px-4 py-3 text-left font-medium text-ink-muted">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-ink-muted">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-ink-muted">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-ink-muted">Nullifier</th>
                    <th className="px-4 py-3 text-left font-medium text-ink-muted">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {transactions.map((tx) => (
                    <tr key={tx.nullifier} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3 text-neutral-300">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            tx.type === "deposit"
                              ? "bg-accent-soft/50 text-accent"
                              : tx.type === "withdraw"
                                ? "bg-signal-danger/15 text-red-200"
                                : "bg-blue-900/50 text-blue-200"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-neutral-300">
                        {tx.amount ?? "REDACTED"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-subtle">
                        {tx.nullifier}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            tx.status === "confirmed"
                              ? "bg-accent-soft/50 text-accent"
                              : "bg-amber-900/50 text-amber-200"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Info Box */}
        <section className="mt-8 rounded-lg border border-border bg-surface p-6">
          <h3 className="font-semibold text-ink">About This Audit</h3>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-subtle">Audit Link ID</dt>
              <dd className="mt-1 font-mono text-sm text-neutral-300">{metadata.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Created</dt>
              <dd className="mt-1 text-sm text-neutral-300">
                {new Date(metadata.createdAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Expires</dt>
              <dd className="mt-1 text-sm text-neutral-300">
                {new Date(metadata.expiresAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Issued By</dt>
              <dd className="mt-1 font-mono text-sm text-neutral-300">{metadata.issuedBy}</dd>
            </div>
          </dl>

          {metadata.scopeParams && (
            <div className="mt-4">
              <dt className="text-xs text-ink-subtle">Scope Parameters</dt>
              <dd className="mt-1 rounded bg-bg p-3 font-mono text-xs text-ink-muted">
                {metadata.scopeParams}
              </dd>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

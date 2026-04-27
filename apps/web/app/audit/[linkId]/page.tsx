"use client";

import {
  type AuditScope,
  type FilteredAuditTransaction,
  deriveViewKeyFromSecret,
  exportAuditToCSV,
  filterAuditData,
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
    const scopeParams = metadata.scopeParams ? JSON.parse(metadata.scopeParams) : {};
    const viewKey = deriveViewKeyFromSecret(secretKey, {
      linkId: metadata.id,
      scope: metadata.scope,
      startDate: BigInt(scopeParams.startDate ?? 0),
      endDate: BigInt(scopeParams.endDate ?? Date.now()),
    });

    console.log("Derived view key:", Buffer.from(viewKey).toString("hex"));

    // TODO: Fetch actual transactions from Cloak scan using viewKey
    // For now, show mock data
    const mockData: FilteredAuditTransaction[] = [
      {
        timestamp: Date.now() - 86400000 * 2,
        type: "deposit",
        amount: "1000000000",
        nullifier: "abc123...",
        status: "confirmed",
      },
      {
        timestamp: Date.now() - 86400000,
        type: "transfer",
        amount: "500000000",
        nullifier: "def456...",
        status: "confirmed",
      },
    ];

    const filtered = filterAuditData(mockData, metadata.scope, scopeParams);
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
        return "bg-emerald-900 text-emerald-200";
      case "amounts_only":
        return "bg-blue-900 text-blue-200";
      case "time_ranged":
        return "bg-amber-900 text-amber-200";
    }
  };

  if (error) {
    return (
      <main className="min-h-screen bg-neutral-950">
        <header className="border-b border-neutral-800 bg-neutral-950/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Cloak Squads
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-8">
            <h1 className="text-xl font-semibold text-red-200">Access Error</h1>
            <p className="mt-4 text-neutral-300">{error}</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-700"
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
      <main className="min-h-screen bg-neutral-950">
        <header className="border-b border-neutral-800 bg-neutral-950/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Cloak Squads
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-neutral-400">Loading audit data...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="rounded-md text-sm font-semibold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Cloak Squads
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-emerald-300">Public Audit View</p>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${getScopeBadge(metadata.scope)}`}
              >
                {metadata.scope}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Audit Report</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">
              {getScopeDescription(metadata.scope)}
            </p>
          </div>

          <div className="flex flex-col gap-2 text-right">
            <p className="text-sm text-neutral-500">
              Cofre: {truncateAddress(metadata.cofreAddress)}
            </p>
            <p className="text-sm text-neutral-500">
              Issued by: {truncateAddress(metadata.issuedBy)}
            </p>
            <p className="text-sm text-neutral-500">
              Expires: {new Date(metadata.expiresAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Transactions Table */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-50">Transactions</h2>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={transactions.length === 0}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-700 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center">
              <p className="text-neutral-400">No transactions found for this audit scope.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950">
                    <th className="px-4 py-3 text-left font-medium text-neutral-400">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-400">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-400">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-400">Nullifier</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {transactions.map((tx) => (
                    <tr key={tx.nullifier} className="hover:bg-neutral-800/50">
                      <td className="px-4 py-3 text-neutral-300">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            tx.type === "deposit"
                              ? "bg-emerald-900/50 text-emerald-200"
                              : tx.type === "withdraw"
                                ? "bg-red-900/50 text-red-200"
                                : "bg-blue-900/50 text-blue-200"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-neutral-300">
                        {tx.amount ?? "REDACTED"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                        {tx.nullifier}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            tx.status === "confirmed"
                              ? "bg-emerald-900/50 text-emerald-200"
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
        <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <h3 className="font-semibold text-neutral-50">About This Audit</h3>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-500">Audit Link ID</dt>
              <dd className="mt-1 font-mono text-sm text-neutral-300">{metadata.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Created</dt>
              <dd className="mt-1 text-sm text-neutral-300">
                {new Date(metadata.createdAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Expires</dt>
              <dd className="mt-1 text-sm text-neutral-300">
                {new Date(metadata.expiresAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Issued By</dt>
              <dd className="mt-1 font-mono text-sm text-neutral-300">{metadata.issuedBy}</dd>
            </div>
          </dl>

          {metadata.scopeParams && (
            <div className="mt-4">
              <dt className="text-xs text-neutral-500">Scope Parameters</dt>
              <dd className="mt-1 rounded bg-neutral-950 p-3 font-mono text-xs text-neutral-400">
                {metadata.scopeParams}
              </dd>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

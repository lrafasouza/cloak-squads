"use client";

import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { buildRevokeAuditIxBrowser } from "@/lib/gatekeeper-instructions";
import { createIssueLicenseProposal } from "@/lib/squads-sdk";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import {
  type AuditScope,
  base64urlEncode,
  exportAuditToCSV,
  generateAuditLinkSecret,
  generateDeterministicMockData,
} from "@cloak-squads/core/audit";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

type AuditLinkSummary = {
  id: string;
  scope: AuditScope;
  scopeParams: string | null;
  expiresAt: string;
  issuedBy: string;
  createdAt: string;
};

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function AuditAdminPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { connection } = useConnection();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const [links, setLinks] = useState<AuditLinkSummary[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);

  // Form state
  const [scope, setScope] = useState<AuditScope>("full");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [expiresInDays, setExpiresInDays] = useState<number>(30);

  const loadLinks = useCallback(async () => {
    if (!multisigAddress) return;
    try {
      const res = await fetchWithAuth(
        `/api/audit-links/${encodeURIComponent(multisigAddress.toBase58())}`,
      );
      if (res.ok) {
        const data = await res.json();
        setLinks(data);
      }
    } catch (err) {
      console.error("Failed to load audit links:", err);
    } finally {
      setLinksLoading(false);
    }
  }, [fetchWithAuth, multisigAddress]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const handleCreateLink = async () => {
    if (!wallet.publicKey || !wallet.signMessage || !multisigAddress) {
      setCreateError("Connect wallet first");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setLastCreatedUrl(null);

    try {
      // Prepare message for signing
      const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
      const scopeParams: { startDate?: number; endDate?: number } = {};

      if (scope === "time_ranged") {
        if (!startDate || !endDate) {
          throw new Error("Select start and end dates for time-ranged scope");
        }
        scopeParams.startDate = new Date(startDate).getTime();
        scopeParams.endDate = new Date(endDate).getTime();
      }

      const message = `create-audit-link:${multisigAddress.toBase58()}:${scope}:${expiresAt}:${wallet.publicKey.toBase58()}`;
      const messageBytes = new TextEncoder().encode(message);

      // Sign message
      const signature = await wallet.signMessage(messageBytes);

      // Create audit link
      const res = await fetchWithAuth("/api/audit-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          scope,
          scopeParams: Object.keys(scopeParams).length > 0 ? scopeParams : undefined,
          expiresAt,
          issuedBy: wallet.publicKey.toBase58(),
          signature: Buffer.from(signature).toString("base64"),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create audit link");
      }

      const data = await res.json();

      // Generate secret for the link fragment
      const secret = generateAuditLinkSecret();
      const secretB64 = base64urlEncode(secret);

      // Build shareable URL with fragment
      const baseUrl = window.location.origin;
      const shareableUrl = `${baseUrl}/audit/${data.id}#${secretB64}`;

      setLastCreatedUrl(shareableUrl);
      void loadLinks();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setIsCreating(false);
    }
  };

  const [showRevokeConfirm, setShowRevokeConfirm] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  const handleRevokeLink = async (linkId: string) => {
    if (!wallet.publicKey || !wallet.signMessage || !connection) return;
    setShowRevokeConfirm(linkId);
  };

  const confirmRevoke = async (linkId: string) => {
    setShowRevokeConfirm(null);

    const publicKey = wallet.publicKey;
    const signMessage = wallet.signMessage;
    if (!publicKey || !signMessage) {
      setRevokeError("Connect a wallet with message signing support.");
      return;
    }

    startTransaction({
      title: "Creating audit revocation proposal",
      description: "Signing the revocation request and opening a Squads proposal.",
      steps: [
        {
          id: "authorize",
          title: "Authorize revocation",
          description: "Sign the wallet message proving you can revoke this audit link.",
        },
        {
          id: "prepare",
          title: "Prepare on-chain instruction",
          description: "Building the gatekeeper revocation instruction.",
          status: "pending",
        },
        {
          id: "proposal",
          title: "Create Squads proposal",
          description: "Your wallet signs the proposal transaction.",
          status: "pending",
        },
      ],
    });

    try {
      const message = `revoke-audit-link:${linkId}:${publicKey.toBase58()}`;
      const messageBytes = new TextEncoder().encode(message);
      const signature = await signMessage(messageBytes);
      updateStep("authorize", { status: "success" });

      updateStep("prepare", { status: "running" });
      const res = await fetchWithAuth(`/api/audit/${linkId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuedBy: publicKey.toBase58(),
          signature: Buffer.from(signature).toString("base64"),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        setRevokeError(error.error || "Failed to revoke link");
        return;
      }

      const data = await res.json();
      if (!data.success || !data.diversifier || !data.cofreAddress) {
        setRevokeError("Failed to get revocation data");
        return;
      }

      // Create on-chain revocation proposal via Squads
      const msAddress = new PublicKey(data.cofreAddress);
      const diversifier = new Uint8Array(data.diversifier);

      const { instruction } = await buildRevokeAuditIxBrowser({
        multisig: msAddress,
        diversifier,
      });
      updateStep("prepare", { status: "success" });

      updateStep("proposal", { status: "running" });
      const result = await createIssueLicenseProposal({
        connection,
        wallet,
        multisigPda: msAddress,
        issueLicenseIx: instruction,
        memo: `revoke audit: ${linkId}`,
      });
      updateStep("proposal", {
        status: "success",
        signature: result.signature,
        description: `Revocation proposal #${result.transactionIndex.toString()} confirmed.`,
      });
      completeTransaction({
        title: "Audit revocation proposal ready",
        description: `Proposal #${result.transactionIndex.toString()} is ready for signer approval.`,
      });

      setRevokeSuccess(
        `Revocation proposal created! Transaction index: ${result.transactionIndex.toString()}`,
      );
      void loadLinks();
    } catch (err) {
      console.error("Failed to revoke link:", err);
      const message = err instanceof Error ? err.message : "Failed to revoke link";
      setRevokeError(message);
      failTransaction(message);
    }
  };

  const exportToCSV = (link: AuditLinkSummary) => {
    // Generate deterministic mock data based on linkId
    const scopeParams = link.scopeParams ? JSON.parse(link.scopeParams) : undefined;
    const mockData = generateDeterministicMockData(link.id, 8);

    // Filter by scope (time_ranged only; full/amounts_only pass through)
    let filtered = mockData;
    if (link.scope === "time_ranged" && scopeParams?.startDate && scopeParams?.endDate) {
      filtered = mockData.filter(
        (tx) => tx.timestamp >= scopeParams.startDate && tx.timestamp <= scopeParams.endDate,
      );
    }
    if (link.scope === "amounts_only") {
      filtered = filtered.map((tx) => ({ ...tx, amount: undefined }));
    }

    const csv = exportAuditToCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${link.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/"
          className="text-sm text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Audit Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              {truncateAddress(multisigAddress.toBase58())}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">
              Create and manage scoped audit links for compliance and transparency.
            </p>
          </div>
        </div>

        {/* Create Link Form */}
        <section className="mt-8 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold text-ink">Create Audit Link</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Generate a shareable link with view-only access to transaction history.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="scope" className="block text-sm font-medium text-neutral-300">
                Scope
              </label>
              <select
                id="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as AuditScope)}
                className="mt-1 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-emerald-500 focus:outline-none"
              >
                <option value="full">Full (all data)</option>
                <option value="amounts_only">Amounts Only (no addresses)</option>
                <option value="time_ranged">Time Ranged (date filter)</option>
              </select>
              <p className="mt-1 text-xs text-ink-subtle">
                {scope === "full" &&
                  "View all transaction details including amounts and addresses."}
                {scope === "amounts_only" && "View only transaction amounts (addresses redacted)."}
                {scope === "time_ranged" && "View transactions within a specific date range."}
              </p>
            </div>

            <div>
              <label htmlFor="expiresInDays" className="block text-sm font-medium text-neutral-300">
                Expires in (days)
              </label>
              <input
                id="expiresInDays"
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {scope === "time_ranged" && (
              <>
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium text-neutral-300">
                    Start Date
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-neutral-300">
                    End Date
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>

          {createError && (
            <div className="mt-4 rounded-md bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-200">
              {createError}
            </div>
          )}

          {lastCreatedUrl && (
            <div className="mt-4 rounded-md bg-accent-soft border border-emerald-700 px-4 py-3">
              <p className="text-sm font-medium text-accent">Audit link created!</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={lastCreatedUrl}
                  className="flex-1 rounded-md bg-bg px-3 py-2 text-xs font-mono text-neutral-300"
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(lastCreatedUrl)}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-ink hover:bg-emerald-600"
                >
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-accent/70">
                Share this URL carefully. Anyone with the link can view the scoped audit data.
              </p>
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={handleCreateLink}
              disabled={isCreating || !wallet.publicKey}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? "Creating..." : "Create Audit Link"}
            </button>
          </div>
        </section>

        {/* Links List */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-ink">Active Audit Links</h2>

          {linksLoading ? (
            <p className="mt-4 text-sm text-ink-muted">Loading...</p>
          ) : links.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">No audit links created yet.</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {links.map((link) => (
                <div key={link.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-ink" title={link.id}>
                          {link.id.slice(0, 8)}...{link.id.slice(-4)}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            link.scope === "full"
                              ? "bg-accent-soft text-accent"
                              : link.scope === "amounts_only"
                                ? "bg-blue-900 text-blue-200"
                                : "bg-amber-900 text-amber-200"
                          }`}
                        >
                          {link.scope}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-subtle">
                        Created {new Date(link.createdAt).toLocaleDateString()} · Expires{" "}
                        {new Date(link.expiresAt).toLocaleDateString()}
                      </p>
                      {link.scopeParams && (
                        <p className="mt-1 text-xs text-ink-subtle">
                          {(() => {
                            try {
                              const params = JSON.parse(link.scopeParams) as Record<
                                string,
                                string | number
                              >;
                              const entries = Object.entries(params);
                              if (entries.length === 0) return null;
                              const formatted = entries
                                .map(([key, value]) => {
                                  if (typeof value === "number" && value > 1000000000) {
                                    return `${key}: ${new Date(value).toLocaleDateString()}`;
                                  }
                                  return `${key}: ${value}`;
                                })
                                .join(" · ");
                              return `Filter: ${formatted}`;
                            } catch {
                              return null;
                            }
                          })()}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => exportToCSV(link)}
                        className="rounded-md border border-border-strong px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:bg-surface-2"
                      >
                        Export CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeLink(link.id)}
                        className="rounded-md bg-signal-danger/15 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-900"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Revoke Confirmation Dialog */}
        {showRevokeConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-border-strong bg-surface p-6">
              <h3 className="text-lg font-semibold text-ink">Confirm Revoke</h3>
              <p className="mt-2 text-sm text-ink-muted">
                This will create a Squads proposal to revoke the audit link on-chain.
              </p>
              {revokeError && (
                <p className="mt-3 rounded-md border border-red-900 bg-red-950 p-2 text-xs text-red-200">
                  {revokeError}
                </p>
              )}
              {revokeSuccess && (
                <p className="mt-3 rounded-md border border-emerald-900 bg-emerald-950 p-2 text-xs text-accent">
                  {revokeSuccess}
                </p>
              )}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRevokeConfirm(null);
                    setRevokeError(null);
                    setRevokeSuccess(null);
                  }}
                  className="flex-1 rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmRevoke(showRevokeConfirm)}
                  disabled={Boolean(revokeSuccess)}
                  className="flex-1 rounded-md bg-signal-danger/15 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-900 disabled:opacity-50"
                >
                  Revoke
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

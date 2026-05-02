"use client";

import { cn } from "@/lib/utils";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import {
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { buildRevokeAuditIxBrowser } from "@/lib/gatekeeper-instructions";
import { truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { createIssueLicenseProposal } from "@/lib/squads-sdk";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
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
import { AutoCloseIndicator } from "@/components/ui/auto-close-indicator";
import {
  ArrowRightLeft,
  CheckCircle2,
  Download,
  Link2,
  List,
  Send,
  Settings,
  Shield,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
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

type AuditAdminTab = "activity" | "links" | "export" | "settings";
type ActivityFilter = "all" | "proposals" | "vault" | "operator" | "privacy";
type LinkScopeFilter = "all" | AuditScope;


function downloadText(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseScopeParams(scopeParams: string | null): { startDate?: number; endDate?: number } {
  if (!scopeParams) return {};
  try {
    return JSON.parse(scopeParams) as { startDate?: number; endDate?: number };
  } catch {
    return {};
  }
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
  const [activeTab, setActiveTab] = useState<AuditAdminTab>("activity");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<LinkScopeFilter>("all");

  const { data: proposals = [] } = useProposalSummaries(multisig);

  const activityEvents = useMemo(() => {
    const finalized = proposals.filter(
      (p) => p.status === "executed" || p.status === "rejected" || p.status === "cancelled",
    );
    if (activityFilter === "proposals") return finalized;
    if (activityFilter === "vault" || activityFilter === "operator" || activityFilter === "privacy") return [];
    return finalized;
  }, [proposals, activityFilter]);

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

  /* Auto-close revoke confirmation after 10 seconds */
  useEffect(() => {
    if (!showRevokeConfirm) return;
    const timer = setTimeout(() => {
      setShowRevokeConfirm(null);
      setRevokeError(null);
      setRevokeSuccess(null);
    }, 10000);
    return () => clearTimeout(timer);
  }, [showRevokeConfirm]);

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
          description: "Preparing the revocation proposal.",
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
    const scopeParams = parseScopeParams(link.scopeParams);
    const mockData = generateDeterministicMockData(link.id, 8);

    // Filter by scope (time_ranged only; full/amounts_only pass through)
    let filtered = mockData;
    const { startDate: exportStartDate, endDate: exportEndDate } = scopeParams;
    if (link.scope === "time_ranged" && exportStartDate && exportEndDate) {
      filtered = mockData.filter(
        (tx) => tx.timestamp >= exportStartDate && tx.timestamp <= exportEndDate,
      );
    }
    if (link.scope === "amounts_only") {
      filtered = filtered.map((tx) => ({ ...tx, amount: undefined }));
    }

    downloadText(`audit-${link.id}.csv`, exportAuditToCSV(filtered), "text/csv");
  };

  const exportToJSON = (link: AuditLinkSummary) => {
    const scopeParams = parseScopeParams(link.scopeParams);
    const mockData = generateDeterministicMockData(link.id, 8);
    let filtered = mockData;
    const { startDate: exportStartDate, endDate: exportEndDate } = scopeParams;
    if (link.scope === "time_ranged" && exportStartDate && exportEndDate) {
      filtered = mockData.filter(
        (tx) => tx.timestamp >= exportStartDate && tx.timestamp <= exportEndDate,
      );
    }
    if (link.scope === "amounts_only") {
      filtered = filtered.map((tx) => ({ ...tx, amount: undefined }));
    }

    downloadText(
      `audit-${link.id}.json`,
      JSON.stringify(
        { link, exportedAt: new Date().toISOString(), transactions: filtered },
        null,
        2,
      ),
      "application/json",
    );
  };

  const filteredLinks = useMemo(
    () => links.filter((link) => scopeFilter === "all" || link.scope === scopeFilter),
    [links, scopeFilter],
  );

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/"
          className="text-sm text-accent transition-colors hover:text-accent-hover"
        >
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="AUDIT"
        title="Scoped access"
        description="Manage time-bound audit links for external reviewers. Each link exposes only the data scope you choose."
      />

      <div className="space-y-6">
        {/* Tab bar */}
        <div className="flex items-center gap-0.5 border-b border-border pb-1">
          {(["activity", "links", "export", "settings"] as AuditAdminTab[]).map((tab) => {
            const labels: Record<AuditAdminTab, string> = {
              activity: "Activity",
              links: "Links",
              export: "Exports",
              settings: "Settings",
            };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {labels[tab]}
                {tab === "links" && links.length > 0 && (
                  <span className="text-xs text-ink-subtle tabular-nums">
                    {links.length}
                  </span>
                )}
                {tab === "activity" && activityEvents.length > 0 && (
                  <span className="text-xs text-ink-subtle tabular-nums">
                    {activityEvents.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ACTIVITY TAB */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            {/* Sub-filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "proposals", "vault", "operator", "privacy"] as ActivityFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActivityFilter(f)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    activityFilter === f
                      ? "bg-accent-soft text-accent"
                      : "border border-border text-ink-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {activityFilter !== "all" && activityFilter !== "proposals" ? (
              <div className="rounded-xl border border-border bg-surface p-8 text-center">
                <List className="mx-auto mb-3 h-8 w-8 text-ink-subtle" />
                <p className="text-sm font-medium text-ink-muted">
                  {activityFilter.charAt(0).toUpperCase() + activityFilter.slice(1)} events not yet available
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  On-chain event indexing for this category is coming soon.
                </p>
              </div>
            ) : activityEvents.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-8 text-center">
                <Shield className="mx-auto mb-3 h-8 w-8 text-ink-subtle" />
                <p className="text-sm font-medium text-ink-muted">No activity recorded yet</p>
                <p className="mt-1 text-xs text-ink-subtle">
                  Executed, rejected, and cancelled proposals will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="divide-y divide-border/40">
                  {activityEvents.map((p) => {
                    const isExecuted = p.status === "executed";
                    const isCancelled = p.status === "cancelled";
                    const description =
                      p.type === "payroll"
                        ? `Payroll · ${p.recipientCount ?? "?"} recipients · ${lamportsToSol(p.totalAmount ?? "0")} SOL`
                        : p.amount && p.amount !== "0"
                          ? `${lamportsToSol(p.amount)} SOL → ${truncateAddress(p.recipient)}`
                          : p.memo || "Configuration change";
                    const KindIcon =
                      p.type === "payroll" ? Users : p.type === "single" ? Send : ArrowRightLeft;
                    return (
                      <Link
                        key={p.id}
                        href={`/vault/${multisig}/proposals/${p.transactionIndex}`}
                        className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                            isExecuted
                              ? "border-border text-ink-subtle"
                              : isCancelled
                                ? "border-ink-subtle/30 text-ink-subtle"
                                : "border-signal-danger/30 text-signal-danger"
                          }`}
                        >
                          {isExecuted ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <KindIcon className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                          <span className="truncate text-sm text-ink">
                            #{p.transactionIndex} — {description}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-ink-muted">
                          {(p.status ?? "").charAt(0).toUpperCase() + (p.status ?? "").slice(1)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LINKS TAB */}
        {activeTab === "links" && (
          <div className="space-y-6">
            <Panel>
              <PanelHeader icon={Link2} title="Create audit link" />
              <PanelBody className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="scope" className="block text-sm font-medium text-ink">
                      Scope
                    </label>
                    <select
                      id="scope"
                      value={scope}
                      onChange={(e) => setScope(e.target.value as AuditScope)}
                      className="mt-1 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <option value="full">Full (all data)</option>
                      <option value="amounts_only">Amounts Only (no addresses)</option>
                      <option value="time_ranged">Time Ranged (date filter)</option>
                    </select>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {scope === "full" &&
                        "View all transaction details including amounts and addresses."}
                      {scope === "amounts_only" &&
                        "View only transaction amounts (addresses redacted)."}
                      {scope === "time_ranged" && "View transactions within a specific date range."}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="expiresInDays" className="block text-sm font-medium text-ink">
                      Expires in (days)
                    </label>
                    <input
                      id="expiresInDays"
                      type="number"
                      min={1}
                      max={365}
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(Number(e.target.value))}
                      className="mt-1 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </div>

                  {scope === "time_ranged" && (
                    <>
                      <div>
                        <label htmlFor="startDate" className="block text-sm font-medium text-ink">
                          Start Date
                        </label>
                        <input
                          id="startDate"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        />
                      </div>
                      <div>
                        <label htmlFor="endDate" className="block text-sm font-medium text-ink">
                          End Date
                        </label>
                        <input
                          id="endDate"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        />
                      </div>
                    </>
                  )}
                </div>

                {createError && <InlineAlert tone="danger">{createError}</InlineAlert>}

                {lastCreatedUrl && (
                  <div className="rounded-md border border-accent/25 bg-accent-soft px-4 py-3">
                    <p className="text-sm font-medium text-accent">Audit link created!</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={lastCreatedUrl}
                        className="flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-ink-muted"
                      />
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(lastCreatedUrl)}
                        className="min-h-9 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-accent/70">
                      Share this URL carefully. Anyone with the link can view the scoped audit data.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreateLink}
                  disabled={isCreating || !wallet.publicKey}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create Audit Link"}
                </button>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                icon={Shield}
                title="Active links"
                action={
                  <select
                    value={scopeFilter}
                    onChange={(event) => setScopeFilter(event.target.value as LinkScopeFilter)}
                    className="min-h-8 rounded-md border border-border-strong bg-bg px-2 text-xs font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <option value="all">All scopes</option>
                    <option value="full">Full</option>
                    <option value="amounts_only">Amounts only</option>
                    <option value="time_ranged">Time ranged</option>
                  </select>
                }
              />
              <PanelBody>
                {linksLoading ? (
                  <p className="text-sm text-ink-muted">Loading...</p>
                ) : filteredLinks.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm font-semibold text-ink">No audit links yet</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Create a scoped link to share audit access with external reviewers.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {filteredLinks.map((link) =>(
                      <div key={link.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-ink" title={link.id}>
                                {link.id.slice(0, 8)}...{link.id.slice(-4)}
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
                                <span className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  link.scope === "full" ? "bg-accent" :
                                  link.scope === "amounts_only" ? "bg-ink-subtle" :
                                  "bg-signal-warn"
                                )} />
                                {link.scope === "full" ? "Full" : link.scope === "amounts_only" ? "Amounts only" : "Time ranged"}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-ink-subtle">
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
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                              CSV
                            </button>
                            <button
                              type="button"
                              onClick={() => exportToJSON(link)}
                              className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 py-2 text-xs font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                            >
                              JSON
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeLink(link.id)}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-signal-danger/30 hover:text-signal-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Revoke
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PanelBody>
            </Panel>
          </div>
        )}

        {/* EXPORTS TAB */}
        {activeTab === "export" && (
          <Panel>
            <PanelHeader icon={Download} title="Exports" />
            <PanelBody>
              {filteredLinks.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-ink-muted">No items yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {filteredLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-mono text-sm text-ink">{link.id}</p>
                        <p className="mt-0.5 text-xs text-ink-subtle">
                          {link.scope === "full" ? "Full" : link.scope === "amounts_only" ? "Amounts only" : "Time ranged"} · expires{" "}
                          {new Date(link.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => exportToCSV(link)}
                          className="inline-flex min-h-8 items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
                        >
                          CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => exportToJSON(link)}
                          className="inline-flex min-h-8 items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
                        >
                          JSON
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PanelBody>
          </Panel>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <Panel>
            <PanelHeader icon={Settings} title="Settings" />
            <PanelBody>
              <dl className="grid gap-6 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium text-ink-subtle">Default scope</dt>
                  <dd className="mt-1 text-ink">{scope}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-ink-subtle">Expiry</dt>
                  <dd className="mt-1 text-ink">{expiresInDays} days</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-ink-subtle">Links</dt>
                  <dd className="mt-1 text-ink">{links.length}</dd>
                </div>
              </dl>
            </PanelBody>
          </Panel>
        )}
      </div>

      {/* Revoke Confirmation Dialog */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md rounded-xl border border-border-strong bg-surface p-6 shadow-raise-2">
            <div className="absolute right-4 top-4 flex items-center gap-2">
              <AutoCloseIndicator
                durationMs={10000}
                onComplete={() => {
                  setShowRevokeConfirm(null);
                  setRevokeError(null);
                  setRevokeSuccess(null);
                }}
                paused={!showRevokeConfirm}
              />
              <button
                type="button"
                onClick={() => {
                  setShowRevokeConfirm(null);
                  setRevokeError(null);
                  setRevokeSuccess(null);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className="pr-16 text-lg font-semibold text-ink">Confirm Revoke</h3>
            <p className="mt-2 text-sm text-ink-muted">
              This will create a Squads proposal to revoke the audit link on-chain.
            </p>
            {revokeError && (
              <InlineAlert tone="danger" className="mt-3">
                {revokeError}
              </InlineAlert>
            )}
            {revokeSuccess && (
              <InlineAlert tone="success" className="mt-3">
                {revokeSuccess}
              </InlineAlert>
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
                className="flex-1 rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-ink-muted transition hover:border-signal-danger/30 hover:text-signal-danger disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}

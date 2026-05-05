"use client";

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
import { createIssueLicenseProposal } from "@/lib/squads-sdk";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
import {
  type AuditScope,
  type FilteredAuditTransaction,
  base64urlEncode,
  exportAuditToCSV,
  generateAuditLinkSecret,
  generateDeterministicMockData,
} from "@cloak-squads/core/audit";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Settings,
  Shield,
  Trash2,
  X,
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

type AuditAdminTab = "links" | "settings";
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
  const [activeTab, setActiveTab] = useState<AuditAdminTab>("links");
  const [scopeFilter, setScopeFilter] = useState<LinkScopeFilter>("all");

  const [scope, setScope] = useState<AuditScope>("full");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const STORAGE_KEY = useMemo(() => `audit-link-urls:${multisig}`, [multisig]);

  const [linkUrls, setLinkUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setLinkUrls(JSON.parse(stored) as Record<string, string>);
    } catch {}
  }, [STORAGE_KEY]);

  const persistLinkUrl = useCallback(
    (linkId: string, url: string) => {
      setLinkUrls((prev) => {
        const next = { ...prev, [linkId]: url };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [STORAGE_KEY],
  );

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

      const signature = await wallet.signMessage(messageBytes);

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

      const secret = generateAuditLinkSecret();
      const secretB64 = base64urlEncode(secret);

      const baseUrl = window.location.origin;
      const shareableUrl = `${baseUrl}/audit/${data.id}#${secretB64}`;

      setLastCreatedUrl(shareableUrl);
      persistLinkUrl(data.id, shareableUrl);
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
        failTransaction(error.error || "Failed to revoke link");
        return;
      }

      const data = await res.json();
      if (!data.success || !data.diversifier || !data.cofreAddress) {
        setRevokeError("Failed to get revocation data");
        failTransaction("Failed to get revocation data");
        return;
      }

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
    const mockData = generateDeterministicMockData(link.id, 8);

    let filtered: FilteredAuditTransaction[] = mockData;
    const scopeParams = parseScopeParams(link.scopeParams);
    const { startDate: exportStartDate, endDate: exportEndDate } = scopeParams;
    if (link.scope === "time_ranged" && exportStartDate && exportEndDate) {
      filtered = mockData.filter(
        (tx) => tx.timestamp >= exportStartDate && tx.timestamp <= exportEndDate,
      );
    }
    if (link.scope === "amounts_only") {
      filtered = filtered.map((tx) => ({ ...tx, nullifier: "REDACTED" }));
    }

    downloadText(`audit-${link.id}.csv`, exportAuditToCSV(filtered), "text/csv");
  };

  const exportToJSON = (link: AuditLinkSummary) => {
    const mockData = generateDeterministicMockData(link.id, 8);
    let filtered: FilteredAuditTransaction[] = mockData;
    const scopeParams = parseScopeParams(link.scopeParams);
    const { startDate: exportStartDate, endDate: exportEndDate } = scopeParams;
    if (link.scope === "time_ranged" && exportStartDate && exportEndDate) {
      filtered = mockData.filter(
        (tx) => tx.timestamp >= exportStartDate && tx.timestamp <= exportEndDate,
      );
    }
    if (link.scope === "amounts_only") {
      filtered = filtered.map((tx) => ({ ...tx, nullifier: "REDACTED" }));
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

  const activeLinks = useMemo(
    () => links.filter((link) => new Date(link.expiresAt) > new Date()),
    [links],
  );

  const expiredLinks = useMemo(
    () => links.filter((link) => new Date(link.expiresAt) <= new Date()),
    [links],
  );

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-accent transition-colors hover:text-accent-hover">
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
        <div className="flex items-center gap-0.5 border-b border-border pb-1">
          {(["links", "settings"] as AuditAdminTab[]).map((tab) => {
            const labels: Record<AuditAdminTab, string> = {
              links: "Links",
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
                  <span className="text-xs text-ink-subtle tabular-nums">{links.length}</span>
                )}
              </button>
            );
          })}
        </div>

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
                      <option value="amounts_only">Amounts Only (no identifiers)</option>
                      <option value="time_ranged">Time Ranged (date filter)</option>
                    </select>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {scope === "full" &&
                        "View all transaction details including amounts and identifiers."}
                      {scope === "amounts_only" &&
                        "View transaction amounts with identifiers redacted."}
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
                    {filteredLinks.map((link) => {
                      const isExpired = new Date(link.expiresAt) < new Date();
                      const isExpanded = expandedLinkId === link.id;
                      const shareUrl = linkUrls[link.id];
                      return (
                        <div key={link.id} className="py-4 first:pt-0 last:pb-0">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setExpandedLinkId(isExpanded ? null : link.id)}
                                  className="inline-flex items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
                                  aria-label={isExpanded ? "Collapse" : "Expand"}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                                <span className="font-mono text-sm text-ink" title={link.id}>
                                  {link.id.slice(0, 8)}...{link.id.slice(-4)}
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      link.scope === "full"
                                        ? "bg-accent"
                                        : link.scope === "amounts_only"
                                          ? "bg-ink-subtle"
                                          : "bg-signal-warn",
                                    )}
                                  />
                                  {link.scope === "full"
                                    ? "Full"
                                    : link.scope === "amounts_only"
                                      ? "Amounts only"
                                      : "Time ranged"}
                                </span>
                                {isExpired && (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-signal-danger/30 px-1.5 py-0.5 text-[10px] font-semibold text-signal-danger">
                                    EXPIRED
                                  </span>
                                )}
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

                            <div className="flex flex-wrap shrink-0 gap-2">
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
                              {!isExpired && (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeLink(link.id)}
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-signal-danger/30 hover:text-signal-danger"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Revoke
                                </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 space-y-4 rounded-lg border border-border/60 bg-surface-2/50 px-4 py-3">
                              {shareUrl ? (
                                <div>
                                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                                    Shareable link
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={shareUrl}
                                      className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-[11px] text-ink-muted"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(shareUrl);
                                        setCopiedLinkId(link.id);
                                        setTimeout(() => setCopiedLinkId(null), 2000);
                                      }}
                                      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                                    >
                                      <Copy className="h-3 w-3" />
                                      {copiedLinkId === link.id ? "Copied" : "Copy"}
                                    </button>
                                    <a
                                      href={shareUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex min-h-8 items-center justify-center rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                                    Shareable link
                                  </p>
                                  <p className="mt-1.5 text-xs text-ink-subtle">
                                    Link URL not available (secret was generated in a previous
                                    session).
                                  </p>
                                </div>
                              )}

                              <div>
                                <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                                  History
                                </p>
                                <ol className="mt-2 space-y-2">
                                  <li className="flex items-start gap-2.5">
                                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                                      <Link2 className="h-2.5 w-2.5 text-accent" />
                                    </span>
                                    <div>
                                      <p className="text-xs font-medium text-ink">Link created</p>
                                      <p className="text-[11px] text-ink-subtle">
                                        {new Date(link.createdAt).toLocaleString()} · Issued by{" "}
                                        <span className="font-mono">
                                          {link.issuedBy.slice(0, 6)}...{link.issuedBy.slice(-4)}
                                        </span>
                                      </p>
                                    </div>
                                  </li>
                                  <li className="flex items-start gap-2.5">
                                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-3">
                                      <Shield className="h-2.5 w-2.5 text-ink-subtle" />
                                    </span>
                                    <div>
                                      <p className="text-xs font-medium text-ink">
                                        Scope:{" "}
                                        {link.scope === "full"
                                          ? "Full access"
                                          : link.scope === "amounts_only"
                                            ? "Amounts only (identifiers redacted)"
                                            : "Time ranged"}
                                      </p>
                                      {link.scopeParams && (
                                        <p className="text-[11px] text-ink-subtle">
                                          {(() => {
                                            try {
                                              const p = JSON.parse(link.scopeParams) as Record<
                                                string,
                                                number
                                              >;
                                              return Object.entries(p)
                                                .map(([k, v]) =>
                                                  typeof v === "number" && v > 1000000000
                                                    ? `${k}: ${new Date(v).toLocaleDateString()}`
                                                    : `${k}: ${v}`,
                                                )
                                                .join(" · ");
                                            } catch {
                                              return null;
                                            }
                                          })()}
                                        </p>
                                      )}
                                    </div>
                                  </li>
                                  <li className="flex items-start gap-2.5">
                                    <span
                                      className={cn(
                                        "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                                        isExpired ? "bg-signal-danger/10" : "bg-accent-soft",
                                      )}
                                    >
                                      {isExpired ? (
                                        <X className="h-2.5 w-2.5 text-signal-danger" />
                                      ) : (
                                        <Clock className="h-2.5 w-2.5 text-accent" />
                                      )}
                                    </span>
                                    <div>
                                      <p className="text-xs font-medium text-ink">
                                        {isExpired ? "Expired" : "Expires"}{" "}
                                        {new Date(link.expiresAt).toLocaleString()}
                                      </p>
                                    </div>
                                  </li>
                                </ol>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </PanelBody>
            </Panel>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <Panel>
            <PanelHeader icon={Settings} title="Audit overview" />
            <PanelBody>
              <dl className="grid gap-6 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium text-ink-subtle">Total links</dt>
                  <dd className="mt-1 text-2xl font-semibold text-ink">{links.length}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
                    <CheckCircle2 className="h-3 w-3 text-accent" />
                    Active
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-ink">{activeLinks.length}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
                    <Clock className="h-3 w-3 text-ink-subtle" />
                    Expired
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-ink">{expiredLinks.length}</dd>
                </div>
              </dl>

              {links.length > 0 && (
                <div className="mt-6">
                  <dt className="text-xs font-medium text-ink-subtle mb-3">Links by scope</dt>
                  <div className="grid gap-3 grid-cols-3">
                    {(["full", "amounts_only", "time_ranged"] as const).map((s) => {
                      const count = links.filter((l) => l.scope === s).length;
                      if (count === 0) return null;
                      return (
                        <dd
                          key={s}
                          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-center"
                        >
                          <p className="text-lg font-semibold text-ink">{count}</p>
                          <p className="text-xs text-ink-subtle">
                            {s === "full"
                              ? "Full"
                              : s === "amounts_only"
                                ? "Amounts only"
                                : "Time ranged"}
                          </p>
                        </dd>
                      );
                    })}
                  </div>
                </div>
              )}
            </PanelBody>
          </Panel>
        )}
      </div>

      {showRevokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md rounded-xl border border-border-strong bg-surface p-6 shadow-raise-2">
            <button
              type="button"
              onClick={() => {
                setShowRevokeConfirm(null);
                setRevokeError(null);
                setRevokeSuccess(null);
              }}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
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

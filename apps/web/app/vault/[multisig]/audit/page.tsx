"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import {
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { publicEnv } from "@/lib/env";
import { buildRevokeAuditIxBrowser } from "@/lib/gatekeeper-instructions";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import { createIssueLicenseProposal } from "@/lib/squads-sdk";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
import {
  type AuditScope,
  MAX_REVOKED_AUDIT,
  base64urlEncode,
  generateAuditLinkSecret,
} from "@cloak-squads/core/audit";
import { cofrePda } from "@cloak-squads/core/pda";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Eye,
  History,
  Link2,
  Loader2,
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

type LinkScopeFilter = "all" | AuditScope;

/** "2m" / "3h" / "5d" / "just now" — matches the proposals page rhythm. */
function relativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

const SCOPE_OPTIONS: ReadonlyArray<{
  value: AuditScope;
  label: string;
  hint: string;
  icon: typeof Eye;
}> = [
  {
    value: "full",
    label: "Full",
    hint: "All transaction details — amounts, addresses, timestamps.",
    icon: Eye,
  },
  {
    value: "amounts_only",
    label: "Amounts only",
    hint: "Amounts visible · identifiers redacted from the export.",
    icon: Coins,
  },
  {
    value: "time_ranged",
    label: "Time-ranged",
    hint: "Bound to a date window — only entries inside the range.",
    icon: CalendarRange,
  },
];

function downloadText(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type AuditAccessEntry = {
  id: string;
  action: "view" | "view_transactions" | "export_csv" | "export_json";
  ip: string | null;
  userAgent: string | null;
  accessedAt: string;
};

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
  // On-chain `Cofre.revoked_audit` Vec length. The cofre realloc-grows by
  // 16 bytes per revocation up to MAX_REVOKED_AUDIT (256). null = not yet
  // fetched; -1 = cofre not initialized yet.
  const [revokedOnChain, setRevokedOnChain] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<LinkScopeFilter>("all");

  const [scope, setScope] = useState<AuditScope>("full");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [detailLinkId, setDetailLinkId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [lastUrlCopied, setLastUrlCopied] = useState(false);

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

  // Fetch the on-chain Cofre once per page mount so the admin sees how
  // close they are to the revocation cap. Best-effort — if the cofre is
  // not initialised yet (new vault) or RPC fails, the tile renders "—".
  useEffect(() => {
    if (!multisigAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const gatekeeperProgram = new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID);
        const [cofreAddr] = cofrePda(multisigAddress, gatekeeperProgram);
        const accountInfo = await connection.getAccountInfo(cofreAddr);
        if (cancelled) return;
        if (!accountInfo) {
          setRevokedOnChain(-1);
          return;
        }
        const coder = new BorshAccountsCoder(IDL as Idl);
        const decoded = coder.decode<{ revokedAudit?: Array<unknown> }>("Cofre", accountInfo.data);
        setRevokedOnChain(Array.isArray(decoded?.revokedAudit) ? decoded.revokedAudit.length : 0);
      } catch (err) {
        console.error("[audit] cofre revocation count fetch failed:", err);
        if (!cancelled) setRevokedOnChain(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, multisigAddress]);

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

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const handleRevokeLink = (linkId: string) => {
    if (!wallet.publicKey || !wallet.signMessage || !connection) return;
    setRevokeTarget(linkId);
  };

  const confirmRevoke = async (linkId: string) => {
    setRevokeTarget(null);

    const publicKey = wallet.publicKey;
    const signMessage = wallet.signMessage;
    if (!publicKey || !signMessage) {
      // No wallet — surface via the transaction progress modal so the
      // user gets the same failure UI as any other failed step.
      failTransaction("Connect a wallet with message signing support.");
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
        failTransaction(error.error || "Failed to revoke link");
        return;
      }

      const data = await res.json();
      if (!data.success || !data.diversifier || !data.cofreAddress) {
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

      void loadLinks();
    } catch (err) {
      console.error("Failed to revoke link:", err);
      const message = err instanceof Error ? err.message : "Failed to revoke link";
      failTransaction(message);
    }
  };

  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const downloadSignedExport = async (link: AuditLinkSummary, format: "csv" | "json") => {
    setExportingId(link.id);
    setExportError(null);
    try {
      const res = await fetch(`/api/audit/${encodeURIComponent(link.id)}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to generate export.");
      }
      const signed = (await res.json()) as {
        data: string;
        signature: string;
        publicKey: string;
        signedAt: string;
        contentType: string;
      };

      if (format === "csv") {
        // Wrap CSV with a signature header so the file remains valid CSV but
        // carries verifiable provenance — auditors can grep the header out
        // before processing.
        const header = [
          `# audit-export linkId=${link.id} vault=${multisig}`,
          `# signedAt=${signed.signedAt}`,
          `# publicKey=${signed.publicKey}`,
          `# signature=${signed.signature}`,
          "",
        ].join("\n");
        downloadText(`audit-${link.id}.csv`, header + signed.data, "text/csv");
      } else {
        const wrapped = JSON.stringify(
          {
            signature: signed.signature,
            publicKey: signed.publicKey,
            signedAt: signed.signedAt,
            payload: JSON.parse(signed.data),
          },
          null,
          2,
        );
        downloadText(`audit-${link.id}.json`, wrapped, "application/json");
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportingId(null);
    }
  };

  const [accessLogs, setAccessLogs] = useState<Record<string, AuditAccessEntry[]>>({});
  const [loadingAccessFor, setLoadingAccessFor] = useState<string | null>(null);

  const loadAccessLog = useCallback(
    async (linkId: string) => {
      if (!multisigAddress) return;
      setLoadingAccessFor(linkId);
      try {
        const res = await fetchWithAuth(
          `/api/audit-links/${encodeURIComponent(multisigAddress.toBase58())}/${encodeURIComponent(
            linkId,
          )}/access-log`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as AuditAccessEntry[];
        setAccessLogs((prev) => ({ ...prev, [linkId]: data }));
      } finally {
        setLoadingAccessFor(null);
      }
    },
    [fetchWithAuth, multisigAddress],
  );

  const filteredLinks = useMemo(
    () => links.filter((link) => scopeFilter === "all" || link.scope === scopeFilter),
    [links, scopeFilter],
  );

  /** Opens the right-side detail sheet and lazy-loads the access log on
      first view (subsequent opens hit the cached entry). */
  const openDetail = useCallback(
    (linkId: string) => {
      setDetailLinkId(linkId);
      if (!accessLogs[linkId]) {
        void loadAccessLog(linkId);
      }
    },
    [accessLogs, loadAccessLog],
  );

  const selectedLink = useMemo(
    () => (detailLinkId ? (links.find((l) => l.id === detailLinkId) ?? null) : null),
    [detailLinkId, links],
  );

  // If the link backing the open sheet disappears (revoke + reload),
  // close the sheet instead of leaving an empty drawer floating.
  useEffect(() => {
    if (detailLinkId && !linksLoading && !selectedLink) {
      setDetailLinkId(null);
    }
  }, [detailLinkId, linksLoading, selectedLink]);

  const activeLinks = useMemo(
    () => links.filter((link) => new Date(link.expiresAt) > new Date()),
    [links],
  );

  const expiredLinks = useMemo(
    () => links.filter((link) => new Date(link.expiresAt) <= new Date()),
    [links],
  );

  /** Most recent createdAt across all links — fuels the "Last issued"
      tile. Empty links list resolves to null so the tile renders an em-dash. */
  const lastIssuedAt = useMemo(() => {
    if (links.length === 0) return null;
    return links.reduce((latest, link) => {
      const t = new Date(link.createdAt).getTime();
      return t > latest ? t : latest;
    }, 0);
  }, [links]);

  /** Hero copy — mirrors proposals: empty state, then a calm one-liner
      describing what the auditor sees. */
  const heroSubtitle = useMemo(() => {
    if (links.length === 0) {
      return "Issue scoped, time-bound access for external reviewers.";
    }
    if (activeLinks.length === 0) {
      return `All ${links.length} link${links.length === 1 ? "" : "s"} have expired — issue a new one to grant access.`;
    }
    return `${activeLinks.length} active · scoped, time-bound, audit-trail recorded.`;
  }, [links.length, activeLinks.length]);

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-accent transition-aegis hover:text-accent-hover">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <WorkspacePage>
      {/* ── Hero · ledger of scoped accesses ──
          Anchor card matching the /proposals + /operator rhythm: serif
          number, one-line context, and a 4-tile KPI ribbon (total ·
          active · expired · last issued). The Æ watermark sits in the
          bottom-right as a quiet brand moment. */}
      <div className="card-hero relative mb-6 overflow-hidden p-6 md:p-7">
        <HeraldicWatermark />
        <div className="relative">
          <p className="text-eyebrow text-accent">Audit · Scoped access</p>
          <p className="mt-1.5 font-display text-4xl font-semibold leading-none tracking-tight text-ink md:text-5xl">
            <span className="tabular-nums">{links.length}</span>
            <span className="ml-2 font-sans text-base font-medium text-ink-subtle md:text-lg">
              audit {links.length === 1 ? "link" : "links"}
            </span>
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{heroSubtitle}</p>

          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/50 pt-5 sm:grid-cols-4">
            <div>
              <div className="flex items-center gap-1.5 text-eyebrow">
                <Link2 className="h-3 w-3" aria-hidden="true" />
                Total
              </div>
              <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink">
                {links.length}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-eyebrow">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Active
              </div>
              <p
                className={cn(
                  "mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight",
                  activeLinks.length > 0 ? "text-accent" : "text-ink",
                )}
              >
                {activeLinks.length}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-eyebrow">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Expired
              </div>
              <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink-subtle">
                {expiredLinks.length}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-eyebrow">
                <History className="h-3 w-3" aria-hidden="true" />
                Last issued
              </div>
              <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink">
                {lastIssuedAt ? (
                  <>
                    {relativeShort(new Date(lastIssuedAt).toISOString())}
                    <span className="ml-1 text-xs font-normal text-ink-subtle">ago</span>
                  </>
                ) : (
                  <span className="text-ink-subtle">—</span>
                )}
              </p>
            </div>
          </div>
          {/* On-chain revocation cap status. The Cofre PDA stores executed
              revocations as a Vec<[u8; 16]> with a hard ceiling of 256
              entries (no GC). Surfacing this lets the admin notice well
              before a revoke proposal reverts with RevocationCapacity. */}
          {revokedOnChain !== null && revokedOnChain >= 0
            ? (() => {
                const pct = (revokedOnChain / MAX_REVOKED_AUDIT) * 100;
                const tone =
                  pct >= 95
                    ? "text-signal-danger"
                    : pct >= 80
                      ? "text-signal-warn"
                      : "text-ink-subtle";
                return (
                  <p
                    className={cn(
                      "mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium",
                      tone,
                    )}
                  >
                    <Shield className="h-3 w-3" aria-hidden="true" />
                    On-chain revocations:{" "}
                    <span className="font-mono tabular-nums">
                      {revokedOnChain} / {MAX_REVOKED_AUDIT}
                    </span>
                    {pct >= 80 ? <span>· approaching cap</span> : null}
                  </p>
                );
              })()
            : null}
        </div>
      </div>

      <div className="space-y-6">
        <Panel>
          <PanelHeader icon={Link2} title="Create audit link" />
          <PanelBody className="space-y-5">
            {/* Scope picker — segmented radio so reviewers can read scope
                meaning at a glance instead of reading each <option>. */}
            <div>
              <p className="text-eyebrow">Scope</p>
              <div
                role="radiogroup"
                aria-label="Audit scope"
                className="mt-2 grid gap-2 sm:grid-cols-3"
              >
                {SCOPE_OPTIONS.map(({ value, label, hint, icon: Icon }) => {
                  const active = scope === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      // biome-ignore lint/a11y/useSemanticElements: <button role="radio"> hosts icon + label + description as one tap target; matches swap chart-range picker
                      role="radio"
                      aria-checked={active}
                      onClick={() => setScope(value)}
                      className={cn(
                        "group relative rounded-lg border px-3.5 py-3 text-left transition-aegis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                        active
                          ? "border-accent/60 bg-accent-soft shadow-raise-1"
                          : "border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className={cn("h-3.5 w-3.5", active ? "text-accent" : "text-ink-subtle")}
                          aria-hidden="true"
                        />
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            active ? "text-accent" : "text-ink",
                          )}
                        >
                          {label}
                        </span>
                        {active ? (
                          <CheckCircle2
                            className="ml-auto h-3.5 w-3.5 text-accent"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                      <p
                        className={cn(
                          "mt-1.5 text-xs leading-snug",
                          active ? "text-accent/80" : "text-ink-muted",
                        )}
                      >
                        {hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Expiry + (optional) date window */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label htmlFor="expiresInDays" className="block text-eyebrow">
                  Expires in (days)
                </label>
                <input
                  id="expiresInDays"
                  type="number"
                  min={1}
                  max={365}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  className="mt-2 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm tabular-nums text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>

              {scope === "time_ranged" && (
                <>
                  <div>
                    <label htmlFor="startDate" className="block text-eyebrow">
                      Start date
                    </label>
                    <input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-2 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-eyebrow">
                      End date
                    </label>
                    <input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-2 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </div>
                </>
              )}
            </div>

            {createError && <InlineAlert tone="danger">{createError}</InlineAlert>}
            {exportError && <InlineAlert tone="danger">{exportError}</InlineAlert>}

            {/* Issued-link strip — ceremonial receipt. Brass top hairline,
                Æ accent, copy/open buttons, explicit warning that the URL
                is the only auth (no gate). */}
            {lastCreatedUrl && (
              <div className="relative overflow-hidden rounded-lg border border-accent/30 bg-accent-soft/60 p-4">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent/0 via-accent to-accent/0"
                />
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <p className="text-eyebrow text-accent">Audit link issued</p>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <input
                    readOnly
                    value={lastCreatedUrl}
                    aria-label="Shareable audit URL"
                    className="min-w-0 flex-1 rounded-md border border-accent/25 bg-bg/70 px-3 py-2 font-mono text-[11px] text-ink"
                  />
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(lastCreatedUrl);
                        setLastUrlCopied(true);
                        setTimeout(() => setLastUrlCopied(false), 2000);
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      {lastUrlCopied ? "Copied" : "Copy"}
                    </button>
                    <a
                      href={lastCreatedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open audit link"
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-accent/30 bg-bg/40 px-3 text-xs font-semibold text-accent transition-aegis hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-[11px] leading-snug text-accent/80">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Anyone with this URL can view the scoped data — share carefully.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleCreateLink}
              disabled={isCreating || !wallet.publicKey}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-accent to-accent-hover px-4 py-2 text-sm font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:shadow-accent-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {isCreating ? "Issuing…" : "Issue audit link"}
            </button>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            icon={Shield}
            title="Issued links"
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
              <div className="flex items-center justify-center gap-2 py-12 text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Loading…</span>
              </div>
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
                  return (
                    <div
                      key={link.id}
                      className="group flex flex-col gap-3 py-4 transition-aegis first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-ink" title={link.id}>
                            {link.id.slice(0, 8)}…{link.id.slice(-4)}
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
                            <span className="inline-flex items-center gap-1 rounded-md border border-signal-danger/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal-danger">
                              Expired
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-ink-subtle">
                          Created {new Date(link.createdAt).toLocaleDateString()} · Expires{" "}
                          {new Date(link.expiresAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex flex-wrap shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => downloadSignedExport(link, "csv")}
                          disabled={exportingId === link.id}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-semibold text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadSignedExport(link, "json")}
                          disabled={exportingId === link.id}
                          className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 py-2 text-xs font-semibold text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                        >
                          JSON
                        </button>
                        {!isExpired && (
                          <button
                            type="button"
                            onClick={() => handleRevokeLink(link.id)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-xs font-semibold text-ink-muted transition-aegis hover:border-signal-danger/30 hover:text-signal-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Revoke
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openDetail(link.id)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-aegis hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                          aria-label={`View audit link ${link.id.slice(0, 8)}`}
                        >
                          View
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>

      {/* Detail sheet — shareable URL, access log, history timeline.
          Mirrors the operator "Recent" pattern: one click away from any
          row, no modal flow disruption. */}
      <Sheet
        open={detailLinkId !== null}
        onOpenChange={(v) => {
          if (!v) setDetailLinkId(null);
        }}
      >
        <SheetContent side="right" className="flex flex-col">
          {selectedLink ? (
            <>
              <SheetHeader className="px-0 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
                    <Shield className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-eyebrow">Audit · scoped link</p>
                    <SheetTitle className="mt-0.5 truncate font-mono">
                      {selectedLink.id.slice(0, 12)}…{selectedLink.id.slice(-6)}
                    </SheetTitle>
                  </div>
                </div>
                <SheetDescription className="mt-2">
                  {selectedLink.scope === "full"
                    ? "Full access — amounts, addresses, timestamps."
                    : selectedLink.scope === "amounts_only"
                      ? "Amounts visible · identifiers redacted."
                      : "Time-ranged window — only entries inside the range."}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-5 overflow-y-auto pt-3">
                {/* Shareable URL */}
                <div>
                  <p className="text-eyebrow">Shareable link</p>
                  {linkUrls[selectedLink.id] ? (
                    <div className="mt-2 flex flex-wrap items-stretch gap-2">
                      <input
                        readOnly
                        value={linkUrls[selectedLink.id]}
                        aria-label="Shareable audit URL"
                        className="min-w-0 flex-1 rounded-md border border-border bg-bg/70 px-3 py-2 font-mono text-[11px] text-ink"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url = linkUrls[selectedLink.id];
                          if (!url) return;
                          void navigator.clipboard.writeText(url);
                          setCopiedLinkId(selectedLink.id);
                          setTimeout(() => setCopiedLinkId(null), 2000);
                        }}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 px-2.5 text-xs font-semibold text-ink transition-aegis hover:bg-surface-3"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedLinkId === selectedLink.id ? "Copied" : "Copy"}
                      </button>
                      <a
                        href={linkUrls[selectedLink.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open audit link"
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong bg-surface-2 px-2.5 text-xs font-semibold text-ink transition-aegis hover:bg-surface-3"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink-subtle">
                      Link URL not available — the secret was generated in a previous session and
                      isn’t recoverable. Issue a new link if the URL is lost.
                    </p>
                  )}
                </div>

                {/* Access log */}
                <div>
                  <p className="flex items-center gap-1.5 text-eyebrow">
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    Access log
                  </p>
                  {loadingAccessFor === selectedLink.id && !accessLogs[selectedLink.id] ? (
                    <p className="mt-2 text-xs text-ink-subtle">Loading…</p>
                  ) : (accessLogs[selectedLink.id]?.length ?? 0) === 0 ? (
                    <p className="mt-2 text-xs text-ink-subtle">No accesses recorded yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {(accessLogs[selectedLink.id] ?? []).slice(0, 12).map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-surface-2/50 px-2.5 py-1.5 text-[11px]"
                        >
                          <span className="font-medium text-ink">
                            {entry.action === "view"
                              ? "View"
                              : entry.action === "view_transactions"
                                ? "View transactions"
                                : entry.action === "export_csv"
                                  ? "CSV export"
                                  : "JSON export"}
                          </span>
                          <span className="truncate font-mono text-ink-subtle">
                            {entry.ip ?? "—"} · {new Date(entry.accessedAt).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* History timeline */}
                <div>
                  <p className="text-eyebrow">History</p>
                  <ol className="mt-2 space-y-2.5">
                    <li className="flex items-start gap-2.5">
                      <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                        <Link2 className="h-2.5 w-2.5 text-accent" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">Link created</p>
                        <p className="text-[11px] text-ink-subtle">
                          {new Date(selectedLink.createdAt).toLocaleString()} · Issued by{" "}
                          <span className="font-mono">
                            {selectedLink.issuedBy.slice(0, 6)}…{selectedLink.issuedBy.slice(-4)}
                          </span>
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-3">
                        <Shield className="h-2.5 w-2.5 text-ink-subtle" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">
                          Scope:{" "}
                          {selectedLink.scope === "full"
                            ? "Full access"
                            : selectedLink.scope === "amounts_only"
                              ? "Amounts only (identifiers redacted)"
                              : "Time ranged"}
                        </p>
                        {selectedLink.scopeParams && (
                          <p className="text-[11px] text-ink-subtle">
                            {(() => {
                              try {
                                const p = JSON.parse(selectedLink.scopeParams) as Record<
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
                          new Date(selectedLink.expiresAt) < new Date()
                            ? "bg-signal-danger/10"
                            : "bg-accent-soft",
                        )}
                      >
                        {new Date(selectedLink.expiresAt) < new Date() ? (
                          <X className="h-2.5 w-2.5 text-signal-danger" aria-hidden="true" />
                        ) : (
                          <Clock className="h-2.5 w-2.5 text-accent" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">
                          {new Date(selectedLink.expiresAt) < new Date() ? "Expired" : "Expires"}{" "}
                          {new Date(selectedLink.expiresAt).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  </ol>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmModal
        open={revokeTarget !== null}
        title="Revoke audit link"
        description={
          <>
            This issues a Squads proposal that revokes the audit link on-chain. Existing exports
            already on a reviewer’s machine remain readable, but the link will stop returning data
            after the proposal executes.
            {revokeTarget ? (
              <span className="mt-2 block font-mono text-[11px] text-ink-subtle">
                {revokeTarget.slice(0, 12)}…{revokeTarget.slice(-6)}
              </span>
            ) : null}
          </>
        }
        confirmText="Revoke link"
        confirmVariant="destructive"
        onConfirm={() => {
          if (revokeTarget) void confirmRevoke(revokeTarget);
        }}
        onCancel={() => setRevokeTarget(null)}
      />
    </WorkspacePage>
  );
}

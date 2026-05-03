"use client";

import { DeployFeeBreakdown } from "@/components/create-vault/DeployFeeBreakdown";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { WarningCallout } from "@/components/ui/warning-callout";
import {
  type DeployFeeBreakdown as DeployFeeBreakdownValue,
  estimateDeployFee,
} from "@/lib/deploy-fee";
import { buildInitCofreIxBrowser } from "@/lib/gatekeeper-instructions";
import { lamportsToSol } from "@/lib/sol";
import {
  createInitCofreProposal,
  proposalApprove,
  vaultTransactionExecute,
} from "@/lib/squads-sdk";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Key,
  Loader2,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const { Permission, Permissions } = multisigSdk.types;

interface Step3ReviewProps {
  name: string;
  description: string;
  avatarDataUrl: string;
  members: string[];
  threshold: number;
  operator: string;
  createKeySecret: number[];
  createdMultisig: string;
  bootstrapIndex: string;
  onCreatedMultisig: (value: string) => void;
  onBootstrapIndex: (value: string) => void;
  onBack: () => void;
}

type CreationStatus = "idle" | "pending" | "success" | "error";

interface CreationStep {
  id: string;
  label: string;
  status: "pending" | "running" | "success" | "error";
  signature?: string;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function describeTransactionError(err: unknown) {
  if (!(err instanceof Error)) return "Failed to create vault";

  const details: string[] = [err.message].filter(Boolean);
  const maybeRichError = err as Error & {
    logs?: string[];
    cause?: unknown;
    error?: unknown;
  };

  if (Array.isArray(maybeRichError.logs) && maybeRichError.logs.length > 0) {
    details.push(maybeRichError.logs.join("\n"));
  }
  if (maybeRichError.cause instanceof Error && maybeRichError.cause.message) {
    details.push(maybeRichError.cause.message);
  }
  if (maybeRichError.error instanceof Error && maybeRichError.error.message) {
    details.push(maybeRichError.error.message);
  }

  return details.join("\n");
}

function readProposalStatus(status: unknown): string {
  if (status && typeof status === "object") {
    const kind = (status as { __kind?: unknown }).__kind;
    if (typeof kind === "string") return kind.toLowerCase();
  }
  return "unknown";
}

export function Step3Review({
  name,
  description,
  avatarDataUrl,
  members,
  threshold,
  operator,
  createKeySecret,
  createdMultisig,
  bootstrapIndex: savedBootstrapIndex,
  onCreatedMultisig,
  onBootstrapIndex,
  onBack,
}: Step3ReviewProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const [status, setStatus] = useState<CreationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [createdPda, setCreatedPda] = useState<string | null>(null);
  const [bootstrapIndex, setBootstrapIndex] = useState<string | null>(null);
  const [steps, setSteps] = useState<CreationStep[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deployFee, setDeployFee] = useState<DeployFeeBreakdownValue | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [prefetchedTreasury, setPrefetchedTreasury] = useState<PublicKey | null>(null);
  const submittingRef = useRef(false);

  const myPubkey = wallet.publicKey?.toBase58() ?? "";
  const allMembers = (() => {
    const extra = members.map((m) => m.trim()).filter(Boolean);
    if (myPubkey && !extra.includes(myPubkey)) return [myPubkey, ...extra];
    return extra.length > 0 ? extra : [myPubkey];
  })();

  const createKey = useMemo(
    () => Keypair.fromSecretKey(Uint8Array.from(createKeySecret)),
    [createKeySecret],
  );
  const totalFeeSOL = deployFee ? lamportsToSol(String(deployFee.totalLamports)) : "0.020";
  const requiredLamports = deployFee?.totalLamports ?? 23_000_000;
  const hasInsufficientBalance = walletBalance !== null && walletBalance < requiredLamports;

  useEffect(() => {
    let cancelled = false;
    estimateDeployFee(connection)
      .then((fee) => { if (!cancelled) setDeployFee(fee); })
      .catch(() => { if (!cancelled) setDeployFee(null); });
    return () => { cancelled = true; };
  }, [connection]);

  useEffect(() => {
    if (!wallet.publicKey) return;
    let cancelled = false;
    connection.getBalance(wallet.publicKey)
      .then((bal) => { if (!cancelled) setWalletBalance(bal); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [connection, wallet.publicKey]);

  // Pre-fetch treasury so sendTransaction fires immediately on click (avoids wallet timeout)
  useEffect(() => {
    let cancelled = false;
    const [programConfigPda] = multisigSdk.getProgramConfigPda({});
    multisigSdk.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)
      .then((cfg) => { if (!cancelled) setPrefetchedTreasury(cfg.treasury); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [connection]);

  const updateLocalStep = useCallback((id: string, update: Partial<CreationStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));
  }, []);

  const handleCreate = useCallback(async () => {
    if (submittingRef.current || !wallet.publicKey || !wallet.sendTransaction) return;
    submittingRef.current = true;
    setStatus("pending");
    setError(null);

    const initialSteps: CreationStep[] = [
      { id: "validate", label: "Validate setup", status: "running" },
      { id: "multisig", label: "Create Squads multisig", status: "pending" },
      { id: "bootstrap", label: "Create privacy activation proposal", status: "pending" },
      { id: "initialize", label: "Activate privacy layer", status: "pending" },
    ];
    setSteps(initialSteps);

    startTransaction({
      title: "Creating vault",
      description: "Creating your vault on-chain.",
      steps: [
        { id: "validate", title: "Validate setup", description: "Checking configuration." },
        {
          id: "multisig",
          title: "Create Squads multisig",
          description: "Your wallet signs the creation.",
          status: "pending",
        },
        {
          id: "bootstrap",
          title: "Create privacy activation proposal",
          description: "Preparing the privacy layer setup.",
          status: "pending",
        },
        {
          id: "initialize",
          title: "Activate privacy layer",
          description:
            threshold === 1 ? "Automatically activating for single-signer vaults." : "Waiting for member approvals.",
          status: "pending",
        },
      ],
    });

    try {
      const operatorPk = new PublicKey(operator.trim());
      const [multisigPda] = multisigSdk.getMultisigPda({ createKey: createKey.publicKey });
      const [vaultPda] = multisigSdk.getVaultPda({ multisigPda, index: 0 });

      // Use pre-fetched treasury to avoid RPC call on click path (prevents wallet disconnect timeout)
      let treasury = prefetchedTreasury;
      if (!treasury) {
        const [programConfigPda] = multisigSdk.getProgramConfigPda({});
        const programConfig = await multisigSdk.accounts.ProgramConfig.fromAccountAddress(
          connection,
          programConfigPda,
        );
        treasury = programConfig.treasury;
      }

      const parsedMembers = allMembers.map((addr) => {
        try {
          return new PublicKey(addr);
        } catch {
          throw new Error(`Invalid member address: ${addr}`);
        }
      });

      if (threshold < 1 || threshold > parsedMembers.length) {
        throw new Error(`Threshold must be between 1 and ${parsedMembers.length}`);
      }

      const memberPerms = Permissions.fromPermissions([
        Permission.Initiate,
        Permission.Vote,
        Permission.Execute,
      ]);

      updateLocalStep("validate", { status: "success" });
      updateStep("validate", { status: "success" });

      const existingMultisig =
        createdMultisig ||
        (await connection
          .getAccountInfo(multisigPda)
          .then((account) => (account ? multisigPda.toBase58() : "")));
      if (existingMultisig) {
        onCreatedMultisig(existingMultisig);
        updateLocalStep("multisig", { status: "success" });
        updateStep("multisig", {
          status: "success",
          description: "Existing multisig found for this draft. Skipping creation.",
        });
      } else {
        const createIx = multisigSdk.instructions.multisigCreateV2({
          treasury,
          createKey: createKey.publicKey,
          creator: wallet.publicKey,
          multisigPda,
          configAuthority: null,
          threshold,
          members: parsedMembers.map((key) => ({ key, permissions: memberPerms })),
          timeLock: 0,
          rentCollector: null,
          memo: "Vault created",
        });

        const blockhash = await connection.getLatestBlockhash();
        const fundIx = SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: vaultPda,
          lamports: deployFee?.vaultRentReserveLamports ?? 20_000_000,
        });
        const tx = new Transaction().add(createIx, fundIx);
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = blockhash.blockhash;
        tx.partialSign(createKey);

        updateLocalStep("multisig", { status: "running" });
        updateStep("multisig", { status: "running" });

        let sig: string;
        try {
          sig = await wallet.sendTransaction(tx, connection);
        } catch (sendErr) {
          console.error("[create-vault] multisig create send failed", sendErr);
          throw new Error(describeTransactionError(sendErr));
        }
        await connection.confirmTransaction({ signature: sig, ...blockhash }, "confirmed");
        onCreatedMultisig(multisigPda.toBase58());
        updateLocalStep("multisig", { status: "success", signature: sig });
        updateStep("multisig", { status: "success", signature: sig });
      }

      updateLocalStep("bootstrap", { status: "running" });
      updateStep("bootstrap", { status: "running" });
      let transactionIndex: bigint | null = savedBootstrapIndex
        ? BigInt(savedBootstrapIndex)
        : null;
      let bootstrapSignature: string | undefined;
      if (!transactionIndex) {
        // Dedup: for newly created vaults the init proposal is always index 1.
        // If it already exists and is still active/approved, reuse it instead of creating a duplicate.
        try {
          const [existingProposalPda] = multisigSdk.getProposalPda({
            multisigPda,
            transactionIndex: 1n,
          });
          const existingProposal = await multisigSdk.accounts.Proposal.fromAccountAddress(
            connection,
            existingProposalPda,
          );
          const existingStatus = readProposalStatus(existingProposal.status);
          if (existingStatus === "active" || existingStatus === "approved") {
            transactionIndex = 1n;
            onBootstrapIndex("1");
          }
        } catch {
          // No existing proposal — will create below.
        }
      }
      if (!transactionIndex) {
        const initCofre = await buildInitCofreIxBrowser({
          multisig: multisigPda,
          operator: operatorPk,
        });
        const bootstrap = await createInitCofreProposal({
          connection,
          wallet,
          multisigPda,
          initCofreIx: initCofre.instruction,
          memo: "Activate privacy layer",
        });
        transactionIndex = bootstrap.transactionIndex;
        bootstrapSignature = bootstrap.signature;
        onBootstrapIndex(bootstrap.transactionIndex.toString());
      }
      setBootstrapIndex(transactionIndex.toString());
      updateLocalStep("bootstrap", {
        status: "success",
        ...(bootstrapSignature ? { signature: bootstrapSignature } : {}),
      });
      updateStep("bootstrap", {
        status: "success",
        ...(bootstrapSignature ? { signature: bootstrapSignature } : {}),
        description:
          savedBootstrapIndex || !bootstrapSignature
            ? `Existing privacy activation proposal #${transactionIndex.toString()} found. Skipping creation.`
            : `Proposal #${transactionIndex.toString()} confirmed.`,
      });

      updateLocalStep("initialize", { status: "running" });
      updateStep("initialize", { status: "running" });
      if (threshold === 1) {
        const [proposalPda] = multisigSdk.getProposalPda({
          multisigPda,
          transactionIndex,
        });
        const proposal = await multisigSdk.accounts.Proposal.fromAccountAddress(
          connection,
          proposalPda,
        );
        const proposalStatus = readProposalStatus(proposal.status);
        if (proposalStatus === "executed") {
          updateLocalStep("initialize", { status: "success" });
          updateStep("initialize", {
            status: "success",
            description: "Privacy layer is already active.",
          });
        } else {
          if (proposalStatus === "active") {
            await proposalApprove({
              connection,
              wallet,
              multisigPda,
              transactionIndex,
              memo: "Approve privacy activation",
            });
          }
          const execSig = await vaultTransactionExecute({
            connection,
            wallet,
            multisigPda,
            transactionIndex,
          });
          const execBlockhash = await connection.getLatestBlockhash();
          await connection.confirmTransaction(
            { signature: execSig, ...execBlockhash },
            "confirmed",
          );
          updateLocalStep("initialize", { status: "success", signature: execSig });
          updateStep("initialize", { status: "success", signature: execSig });
        }
      } else {
        updateLocalStep("initialize", { status: "success" });
        updateStep("initialize", {
          status: "success",
          description: "Privacy activation is awaiting member approvals.",
        });
      }

      const metadataResponse = await fetchWithAuth("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigPda.toBase58(),
          name: name.trim(),
          description: description.trim() || undefined,
          avatarUrl: avatarDataUrl || undefined,
        }),
      });
      if (!metadataResponse.ok) {
        const body = (await metadataResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Vault created, but metadata could not be saved.");
      }

      setCreatedPda(multisigPda.toBase58());
      setStatus("success");
      completeTransaction({
        title: threshold === 1 ? "Vault ready!" : "Vault created",
        description:
          threshold === 1
            ? "Your vault is ready. Private transactions are active."
            : "Privacy activation needs member approvals before private sends are available.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create vault";
      setError(msg);
      setStatus("error");
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)));
      failTransaction(msg);
    } finally {
      submittingRef.current = false;
    }
  }, [
    wallet,
    connection,
    allMembers,
    threshold,
    operator,
    createKey,
    createdMultisig,
    savedBootstrapIndex,
    name,
    description,
    avatarDataUrl,
    deployFee,
    prefetchedTreasury,
    onCreatedMultisig,
    onBootstrapIndex,
    fetchWithAuth,
    updateLocalStep,
    startTransaction,
    updateStep,
    completeTransaction,
    failTransaction,
  ]);

  const isPending = status === "pending";

  if (status === "success" && createdPda) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-signal-positive/30 bg-signal-positive/8 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-signal-positive" />
          <h2 className="text-lg font-semibold text-ink">Vault created!</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {bootstrapIndex && threshold > 1
              ? `Privacy activation (proposal #${bootstrapIndex}) needs member approvals before you can send privately.`
              : "Your vault is ready. Private transactions are active."}
          </p>
          <div className="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-ink-subtle">
              Vault address
            </p>
            <p className="mt-1 break-all font-mono text-xs text-ink">{createdPda}</p>
          </div>
        </div>
        <Link
          href={`/vault/${createdPda}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover"
        >
          Open Vault →
        </Link>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-raise-1 md:p-8">
          <h2 className="mb-5 text-sm font-semibold text-ink">Creating vault…</h2>
          <div className="flex flex-col gap-3">
            {steps.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]",
                    s.status === "success"
                      ? "border-signal-positive bg-signal-positive/15 text-signal-positive"
                      : s.status === "running"
                        ? "border-accent text-accent"
                        : s.status === "error"
                          ? "border-signal-danger text-signal-danger"
                          : "border-border text-ink-subtle",
                  )}
                >
                  {s.status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : s.status === "success" ? (
                    "✓"
                  ) : s.status === "error" ? (
                    "✗"
                  ) : (
                    "·"
                  )}
                </div>
                <span
                  className={cn(
                    "flex-1 text-sm",
                    s.status === "running" ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {s.label}
                </span>
                {s.signature && (
                  <a
                    href={`https://solscan.io/tx/${s.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-subtle hover:text-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Vault identity header */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-raise-1 md:p-8">
        <div className="flex items-center gap-3">
          {avatarDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarDataUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
          ) : (
            <VaultIdenticon seed={name} size={44} className="rounded-lg" />
          )}
          <div>
            <h2 className="text-base font-semibold text-ink">{name}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          </div>
        </div>

        {/* Stat row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Members", value: String(allMembers.length), icon: Users },
            { label: "Threshold", value: `${threshold}/${allMembers.length}`, icon: Shield },
            {
              label: "Deploy fee",
              value: `~${totalFeeSOL} SOL`,
              icon: Key,
            },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-surface-2 p-3 text-center"
            >
              <Icon className="mx-auto mb-1.5 h-4 w-4 text-ink-subtle" />
              <p className="text-sm font-semibold tabular-nums text-ink">{value}</p>
              <p className="text-[10px] text-ink-subtle">{label}</p>
            </div>
          ))}
        </div>

        <DeployFeeBreakdown fee={deployFee} />
      </div>

      {/* What will be created */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          <span>What will be created</span>
          {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {detailsOpen && (
          <div className="border-t border-border px-5 py-4">
            <ul className="flex flex-col gap-2 text-xs text-ink-muted">
              {[
                `Squads multisig — ${allMembers.length} members, ${threshold}-of-${allMembers.length} threshold`,
                "Squads vault PDA (index 0)",
                "Privacy layer account",
                `Activation proposal${threshold > 1 ? ` (needs ${threshold} approvals)` : " (auto-approved)"}`,
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-accent">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Members preview */}
      <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
        <p className="mb-3 text-xs font-medium text-ink-subtle uppercase tracking-wider">
          Members ({allMembers.length})
        </p>
        <div className="flex flex-col gap-1.5">
          {allMembers.map((addr) => (
            <div key={addr} className="flex items-center gap-2">
              <span
                className={cn(
                  "font-mono text-xs text-ink-muted",
                  addr === myPubkey && "text-accent",
                )}
              >
                {shortAddr(addr)}
              </span>
              {addr === myPubkey && (
                <span className="rounded-full border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  you
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          Operator: <span className="font-mono text-ink-muted">{shortAddr(operator)}</span>
        </p>
      </div>

      {hasInsufficientBalance && (
        <WarningCallout variant="warning">
          Insufficient SOL balance. You need at least{" "}
          <span className="font-semibold">{totalFeeSOL} SOL</span> to deploy this vault.
          Your wallet currently has{" "}
          <span className="font-semibold">
            {lamportsToSol(String(walletBalance))} SOL
          </span>.
        </WarningCallout>
      )}

      {error && <WarningCallout variant="error">{error}</WarningCallout>}

      {/* Footer */}
      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          className="inline-flex min-h-10 items-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending || !wallet.connected || hasInsufficientBalance}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all",
            "shadow-raise-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            !isPending && wallet.connected && !hasInsufficientBalance
              ? "bg-accent text-accent-ink hover:bg-accent-hover"
              : "bg-surface-2 text-ink-subtle cursor-not-allowed",
          )}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Creating…" : "Confirm & Deploy"}
        </button>
      </div>
    </div>
  );
}

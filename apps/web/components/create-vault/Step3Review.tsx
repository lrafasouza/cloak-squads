"use client";

import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { WarningCallout } from "@/components/ui/warning-callout";
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
import { useCallback, useRef, useState } from "react";

const { Permission, Permissions } = multisigSdk.types;

const VAULT_FUND_LAMPORTS = 20_000_000; // 0.02 SOL
const PLATFORM_FEE_LAMPORTS = 1_000; // 0.001 SOL
const AEGIS_FEE_LAMPORTS = 1_000; // 0.001 SOL

interface Step3ReviewProps {
  name: string;
  description: string;
  members: string[];
  threshold: number;
  operator: string;
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

export function Step3Review({
  name,
  description,
  members,
  threshold,
  operator,
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
  const submittingRef = useRef(false);

  const myPubkey = wallet.publicKey?.toBase58() ?? "";
  const allMembers = (() => {
    const extra = members.map((m) => m.trim()).filter(Boolean);
    if (myPubkey && !extra.includes(myPubkey)) return [myPubkey, ...extra];
    return extra.length > 0 ? extra : [myPubkey];
  })();

  const totalFeeSOL = lamportsToSol(
    String(VAULT_FUND_LAMPORTS + PLATFORM_FEE_LAMPORTS + AEGIS_FEE_LAMPORTS),
  );

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
      { id: "bootstrap", label: "Create bootstrap proposal", status: "pending" },
      { id: "initialize", label: "Initialize vault", status: "pending" },
    ];
    setSteps(initialSteps);

    startTransaction({
      title: "Creating vault",
      description: "Setting up your Aegis vault on-chain.",
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
          title: "Create bootstrap proposal",
          description: "Preparing Aegis initialization.",
          status: "pending",
        },
        {
          id: "initialize",
          title: "Initialize vault",
          description:
            threshold === 1 ? "Auto-approving and executing." : "Waiting for member approvals.",
          status: "pending",
        },
      ],
    });

    try {
      const operatorPk = new PublicKey(operator.trim());
      const createKey = Keypair.generate();
      const [multisigPda] = multisigSdk.getMultisigPda({ createKey: createKey.publicKey });
      const [vaultPda] = multisigSdk.getVaultPda({ multisigPda, index: 0 });

      const [programConfigPda] = multisigSdk.getProgramConfigPda({});
      const programConfig = await multisigSdk.accounts.ProgramConfig.fromAccountAddress(
        connection,
        programConfigPda,
      );
      const treasury = programConfig.treasury;

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
        memo: "Created via Aegis",
      });

      const blockhash = await connection.getLatestBlockhash();
      const fundIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: vaultPda,
        lamports: VAULT_FUND_LAMPORTS,
      });
      const tx = new Transaction().add(createIx, fundIx);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = blockhash.blockhash;
      tx.partialSign(createKey);

      updateLocalStep("multisig", { status: "running" });
      updateStep("multisig", { status: "running" });
      const simulation = await connection.simulateTransaction(tx, undefined, false);
      if (simulation.value.err) {
        console.error("[create-vault] multisig create simulation failed", simulation.value);
        throw new Error(
          [
            `Create Squads multisig simulation failed: ${JSON.stringify(simulation.value.err)}`,
            ...(simulation.value.logs ?? []),
          ].join("\n"),
        );
      }

      let sig: string;
      try {
        sig = await wallet.sendTransaction(tx, connection);
      } catch (sendErr) {
        console.error("[create-vault] multisig create send failed", sendErr);
        throw new Error(describeTransactionError(sendErr));
      }
      await connection.confirmTransaction({ signature: sig, ...blockhash }, "confirmed");
      updateLocalStep("multisig", { status: "success", signature: sig });
      updateStep("multisig", { status: "success", signature: sig });

      updateLocalStep("bootstrap", { status: "running" });
      updateStep("bootstrap", { status: "running" });
      const initCofre = await buildInitCofreIxBrowser({
        multisig: multisigPda,
        operator: operatorPk,
      });
      const bootstrap = await createInitCofreProposal({
        connection,
        wallet,
        multisigPda,
        initCofreIx: initCofre.instruction,
        memo: "Initialize Aegis vault",
      });
      setBootstrapIndex(bootstrap.transactionIndex.toString());
      updateLocalStep("bootstrap", {
        status: "success",
        signature: bootstrap.signature,
      });
      updateStep("bootstrap", {
        status: "success",
        signature: bootstrap.signature,
        description: `Proposal #${bootstrap.transactionIndex.toString()} confirmed.`,
      });

      updateLocalStep("initialize", { status: "running" });
      updateStep("initialize", { status: "running" });
      if (threshold === 1) {
        await proposalApprove({
          connection,
          wallet,
          multisigPda,
          transactionIndex: bootstrap.transactionIndex,
          memo: "Approve vault bootstrap",
        });
        const execSig = await vaultTransactionExecute({
          connection,
          wallet,
          multisigPda,
          transactionIndex: bootstrap.transactionIndex,
        });
        const execBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature: execSig, ...execBlockhash }, "confirmed");
        updateLocalStep("initialize", { status: "success", signature: execSig });
        updateStep("initialize", { status: "success", signature: execSig });
      } else {
        updateLocalStep("initialize", { status: "success" });
        updateStep("initialize", {
          status: "success",
          description: "Bootstrap proposal awaiting member approvals.",
        });
      }

      const metadataResponse = await fetchWithAuth("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigPda.toBase58(),
          name: name.trim(),
          description: description.trim() || undefined,
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
            ? "Your vault is initialized and ready."
            : "Bootstrap proposal needs member approvals.",
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
    name,
    description,
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
              ? `Bootstrap proposal #${bootstrapIndex} needs member approvals before private execution is active.`
              : "Your Aegis vault is initialized and ready."}
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
        <div className="rounded-xl border border-border bg-surface p-6 shadow-raise-1">
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
      <div className="rounded-xl border border-border bg-surface p-5 shadow-raise-1">
        <div className="flex items-center gap-3">
          <VaultIdenticon seed={name} size={44} className="rounded-lg" />
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

        {/* Fee breakdown */}
        <div className="mt-4 rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-xs text-ink-muted leading-relaxed">
          <span className="font-medium text-ink-subtle">Fee breakdown: </span>
          0.001 SOL Squads protocol · 0.001 SOL Aegis registration · 0.02 SOL deposited into your
          vault (withdrawable) · ~0.002 SOL network rent
        </div>
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
                "Aegis Cofre PDA — private execution gatekeeper",
                `Initialization proposal${threshold > 1 ? ` (needs ${threshold} signatures)` : " (auto-executed)"}`,
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
      <div className="rounded-xl border border-border bg-surface p-5">
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
          disabled={isPending || !wallet.connected}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all",
            "shadow-raise-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            !isPending && wallet.connected
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

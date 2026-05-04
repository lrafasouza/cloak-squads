"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { ArrowLeft, CheckCircle2, FileText, PlayCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, use, useCallback, useEffect, useMemo, useState } from "react";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import { ensureCircuitsProxy } from "@/lib/cloak-circuits-proxy";
import { publicEnv } from "@/lib/env";
import {
  type PayrollRecipientInput,
  formatPayrollCsvTemplate,
  parsePayrollCsv,
} from "@/lib/payroll-csv";
import { lamportsToSol } from "@/lib/sol";
import { createVaultProposal } from "@/lib/squads-sdk";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { assertCofreInitialized } from "@cloak-squads/core/cofre-status";
import { cofrePda } from "@cloak-squads/core/pda";
import { computePayloadHash } from "@cloak-squads/core/hashing";
import type { PayloadInvariants } from "@cloak-squads/core/types";
import {
  NATIVE_SOL_MINT,
  computeUtxoCommitment,
  createUtxo,
  generateUtxoKeypair,
} from "@cloak.dev/sdk-devnet";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import * as multisigSdk from "@sqds/multisig";

let zkWarmupSingleton: Promise<void> | null = null;
function warmupZk(): Promise<void> {
  if (!zkWarmupSingleton) {
    zkWarmupSingleton = (async () => {
      ensureCircuitsProxy();
      await generateUtxoKeypair();
    })().catch((err) => {
      zkWarmupSingleton = null;
      throw err;
    });
  }
  return zkWarmupSingleton;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex: string) {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

type PayrollMode = "direct" | "invoice";

type PayrollClaimLink = {
  name: string;
  wallet: string;
  claimUrl: string;
};

type UploadTab = "input" | "preview";

type RecipientNote = {
  name: string;
  wallet: string;
  amount: string;
  memo: string | undefined;
  note: {
    commitment: string;
    keypairPrivateKey: string;
    keypairPublicKey: string;
    blinding: string;
    tokenMint: string;
  };
  invariants: PayloadInvariants;
  hash: Uint8Array;
  instruction: Awaited<ReturnType<typeof buildIssueLicenseIxBrowser>>["instruction"];
  claim: {
    amount: number | string;
    keypairPrivateKey: string;
    keypairPublicKey: string;
    blinding: string;
    commitment: string;
    recipient_vk: string;
    token_mint: string;
  };
  invoiceId?: string;
};

export default function PayrollPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
  const [csvText, setCsvText] = useState("");
  const [recipients, setRecipients] = useState<PayrollRecipientInput[]>([]);
  const [parsedNotes, setParsedNotes] = useState<RecipientNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [dryRunStatus, setDryRunStatus] = useState<"idle" | "running" | "ready" | "error">("idle");
  const [zkWarmup, setZkWarmup] = useState<"idle" | "warming" | "ready">("idle");
  const [uploadTab, setUploadTab] = useState<UploadTab>("input");
  const [mode, setMode] = useState<PayrollMode>("direct");
  const [createdPayroll, setCreatedPayroll] = useState<{
    transactionIndex: string;
    claimLinks: PayrollClaimLink[];
  } | null>(null);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const totalAmount = useMemo(() => {
    return recipients.reduce((sum, r) => sum + BigInt(r.amount), 0n);
  }, [recipients]);

  const duplicateWallets = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const recipient of recipients) {
      if (seen.has(recipient.wallet)) duplicates.add(recipient.wallet);
      seen.add(recipient.wallet);
    }
    return duplicates;
  }, [recipients]);

  const dryRunRows = useMemo(
    () =>
      recipients.map((recipient, index) => ({
        ...recipient,
        index,
        duplicate: duplicateWallets.has(recipient.wallet),
        estimatedCommitment: true,
      })),
    [duplicateWallets, recipients],
  );

  useEffect(() => {
    if (zkWarmupSingleton) {
      void zkWarmupSingleton.then(() => setZkWarmup("ready"));
      return;
    }
    setZkWarmup("warming");
    warmupZk()
      .then(() => setZkWarmup("ready"))
      .catch(() => setZkWarmup("idle"));
  }, []);

  function handleCsvChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    setCsvText(text);
    setError(null);
    setRecipients([]);
    setParsedNotes([]);
    setCreatedPayroll(null);
    setUploadTab("input");
    setDryRunStatus("idle");

    if (!text.trim()) return;

    const { data, errors } = parsePayrollCsv(text);
    if (errors.length > 0 && !data) {
      setError(errors.join("\n"));
      return;
    }
    if (data) {
      setRecipients(data);
      setDryRunStatus("idle");
      if (errors.length > 0) {
        setError(errors.join("\n"));
      }
    }
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      handleCsvChange({ target: { value: text } } as ChangeEvent<HTMLTextAreaElement>);
    };
    reader.readAsText(file);
  }

  const buildNotes = useCallback(async () => {
    if (!multisigAddress) return;
    setError(null);
    setPending(true);
    setDryRunStatus("running");

    try {
      ensureCircuitsProxy();

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      const notes: RecipientNote[] = [];
      for (const recipient of recipients) {
        const recipientPubkey = new PublicKey(recipient.wallet);

        // Generate real Cloak UTXO commitment
        const keypair = await generateUtxoKeypair();
        const mint = NATIVE_SOL_MINT;
        const utxo = await createUtxo(BigInt(recipient.amount), keypair, mint);
        const commitmentBigInt = await computeUtxoCommitment(utxo);
        const commitment = commitmentBigInt.toString(16).padStart(64, "0");

        const note = {
          commitment,
          keypairPrivateKey: keypair.privateKey.toString(16).padStart(64, "0"),
          keypairPublicKey: keypair.publicKey.toString(16).padStart(64, "0"),
          blinding: utxo.blinding.toString(16).padStart(64, "0"),
          tokenMint: mint.toBase58(),
        };
        const invariants: PayloadInvariants = {
          nullifier: randomBytes(32),
          commitment: hexToBytes(note.commitment),
          amount: BigInt(recipient.amount),
          tokenMint: mint,
          recipientVkPub: recipientPubkey.toBytes(),
          nonce: randomBytes(16),
        };

        const hash = computePayloadHash(invariants);
        const { instruction } = await buildIssueLicenseIxBrowser({
          multisig: multisigAddress,
          payloadHash: hash,
          nonce: invariants.nonce,
        });

        notes.push({
          name: recipient.name,
          wallet: recipient.wallet,
          amount: recipient.amount,
          memo: recipient.memo,
          note,
          invariants,
          hash,
          instruction,
          claim: {
            amount: invariants.amount.toString(),
            keypairPrivateKey: note.keypairPrivateKey,
            keypairPublicKey: note.keypairPublicKey,
            blinding: note.blinding,
            commitment: note.commitment,
            recipient_vk: recipientPubkey.toBase58(),
            token_mint: mint.toBase58(),
          },
        });
      }
      setParsedNotes(notes);
      setDryRunStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not build notes.");
      setDryRunStatus("error");
    } finally {
      setPending(false);
    }
  }, [multisigAddress, recipients]);

  async function submitPayroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmChecked(false);
    setPending(true);
    startTransaction({
      title: "Creating payroll proposal",
      description: `Preparing ${parsedNotes.length} private transfer license${parsedNotes.length === 1 ? "" : "s"} for signer approval.`,
      steps: [
        {
          id: "validate",
          title: "Validate payroll",
          description: "Checking wallet, recipients, amounts, and prepared commitments.",
        },
        {
          id: "squads",
          title: "Create Squads proposal",
          description: "Your wallet signs the batch proposal transaction.",
          status: "pending",
        },
        {
          id: "invoices",
          title: mode === "invoice" ? "Create claim links" : "Confirm direct delivery mode",
          description:
            mode === "invoice"
              ? "Creating one claim link per payroll recipient."
              : "Direct deliveries will be handled by the operator after approval.",
          status: "pending",
        },
        {
          id: "persist",
          title: "Save payroll draft",
          description: "Saving the private data needed for operator execution.",
          status: "pending",
        },
      ],
    });

    try {
      if (!wallet.publicKey || !multisigAddress) {
        throw new Error("Connect a wallet and open a valid multisig.");
      }

      if (parsedNotes.length === 0) {
        throw new Error("No recipients prepared. Build notes first.");
      }

      const [vaultPda] = multisigSdk.getVaultPda({ multisigPda: multisigAddress, index: 0 });
      const vaultBalance = await connection.getBalance(vaultPda, "confirmed");
      if (BigInt(vaultBalance) < totalAmount) {
        const deficit = totalAmount - BigInt(vaultBalance);
        throw new Error(
          `Insufficient vault balance. Need ${lamportsToSol(totalAmount.toString())} SOL, vault has ${lamportsToSol(String(vaultBalance))} SOL. Short ${lamportsToSol(deficit.toString())} SOL.`,
        );
      }

      await assertCofreInitialized({
        connection,
        multisig: multisigAddress,
        gatekeeperProgram: new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
      });

      const gatekeeperProgram = new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID);
      const [cofreAddr] = cofrePda(multisigAddress, gatekeeperProgram);
      const cofreAccount = await connection.getAccountInfo(cofreAddr);
      if (!cofreAccount) throw new Error("Privacy vault not found.");
      const coder = new BorshAccountsCoder(IDL as Idl);
      const cofreData = coder.decode<{ operator?: Uint8Array }>("Cofre", cofreAccount.data);
      if (!cofreData?.operator) throw new Error("No operator registered. Set an operator wallet first.");
      const operatorPubkey = new PublicKey(cofreData.operator);

      const fundOperatorIx = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: operatorPubkey,
        lamports: totalAmount,
      });

      updateStep("validate", { status: "success" });
      updateStep("squads", { status: "running" });

      const instructions = parsedNotes.map((n) => n.instruction);
      const result = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: [fundOperatorIx, ...instructions],
        memo: `payroll batch (${parsedNotes.length} recipients)`,
      });
      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Payroll proposal #${result.transactionIndex.toString()} confirmed.`,
      });

      const transactionIndex = result.transactionIndex.toString();
      const totalAmountStr = totalAmount.toString();

      let notesWithInvoices: RecipientNote[] = parsedNotes;
      let claimLinks: PayrollClaimLink[] = [];
      if (mode === "invoice") {
        updateStep("invoices", { status: "running" });
        const invoiceResults = await Promise.all(
          parsedNotes.map(async (n) => {
            const res = await fetchWithAuth("/api/stealth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cofreAddress: multisigAddress.toBase58(),
                invoiceRef: n.memo || undefined,
                memo: `Payroll: ${n.name}`,
                amount: n.amount,
                recipientWallet: n.wallet,
              }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as { error?: string } | null;
              throw new Error(body?.error ?? `Failed to create stealth invoice for ${n.name}.`);
            }
            return (await res.json()) as { id: string; claimUrl: string };
          }),
        );
        claimLinks = parsedNotes
          .map((n, i) => {
            const invoice = invoiceResults[i];
            if (!invoice) throw new Error(`Missing invoice for ${n.name}.`);
            return { note: n, invoice };
          })
          .map(({ note, invoice }) => {
            const claimUrl = invoice.claimUrl;
            if (!claimUrl) throw new Error(`Missing claim link for ${note.name}.`);
            return { name: note.name, wallet: note.wallet, claimUrl };
          });
        notesWithInvoices = parsedNotes.map((n, i) => {
          const invoice = invoiceResults[i];
          if (!invoice) throw new Error(`Missing invoice for ${n.name}.`);
          return {
            ...n,
            invoiceId: invoice.id,
          };
        });
        updateStep("invoices", {
          status: "success",
          description: `${claimLinks.length} claim link${claimLinks.length === 1 ? "" : "s"} created.`,
        });
      } else {
        updateStep("invoices", { status: "success" });
      }

      updateStep("persist", { status: "running" });
      // Persist payroll draft
      const draftPayload = {
        cofreAddress: multisigAddress.toBase58(),
        transactionIndex,
        memo: `payroll batch (${parsedNotes.length} recipients)`,
        totalAmount: totalAmountStr,
        mode,
        recipients: notesWithInvoices.map((n) => ({
          name: n.name,
          wallet: n.wallet,
          amount: n.amount,
          memo: n.memo,
          payloadHash: Array.from(n.hash),
          invariants: {
            nullifier: Array.from(n.invariants.nullifier),
            commitment: Array.from(n.invariants.commitment),
            amount: n.invariants.amount.toString(),
            tokenMint: n.invariants.tokenMint.toBase58(),
            recipientVkPub: Array.from(n.invariants.recipientVkPub),
            nonce: Array.from(n.invariants.nonce),
          },
          commitmentClaim: n.claim,
          invoiceId: n.invoiceId,
          signature: result.signature,
        })),
      };

      const draftResponse = await fetchWithAuth("/api/payrolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload),
      });

      if (!draftResponse.ok) {
        const body = (await draftResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not persist payroll draft.");
      }
      updateStep("persist", { status: "success" });
      completeTransaction({
        title: "Payroll proposal ready",
        description:
          mode === "invoice"
            ? "The payroll proposal and claim links are ready."
            : `Proposal #${transactionIndex} is ready for signer approval.`,
      });

      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });

      // Store claims in sessionStorage
      for (let i = 0; i < parsedNotes.length; i++) {
        const n = parsedNotes[i]; // safe: loop bound is parsedNotes.length
        if (!n) continue;
        try {
          sessionStorage.setItem(
            `claim:${multisigAddress.toBase58()}:${transactionIndex}:${i}`,
            JSON.stringify(n.claim),
          );
        } catch {
          /* sessionStorage full or unavailable */
        }
      }

      if (mode === "invoice") {
        try {
          sessionStorage.setItem(
            `payroll-claim-links:${multisigAddress.toBase58()}:${transactionIndex}`,
            JSON.stringify(claimLinks),
          );
        } catch {
          /* sessionStorage full or unavailable */
        }
        setCreatedPayroll({ transactionIndex, claimLinks });
        setPending(false);
      } else {
        router.push(`/vault/${multisig}/proposals/${transactionIndex}`);
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not create payroll proposal.";
      setError(message);
      failTransaction(message);
      setPending(false);
    }
  }

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

  // Success state — show claim links card
  if (createdPayroll) {
    return (
      <WorkspacePage>
        <WorkspaceHeader
          eyebrow="PAYROLL"
          title="Claim links ready"
          description="Share each link with the matching recipient. These secret links are only shown in this browser session."
          action={
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
              Max 10
            </span>
          }
        />

        <Panel>
          <PanelHeader
            icon={CheckCircle2}
            title={`Claim links created · Proposal #${createdPayroll.transactionIndex}`}
          />
          <PanelBody>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  const lines = createdPayroll.claimLinks.map((link) => {
                    const fullUrl =
                      typeof window === "undefined"
                        ? link.claimUrl
                        : `${window.location.origin}${link.claimUrl}`;
                    return `${link.name},${link.wallet},${fullUrl}`;
                  });
                  navigator.clipboard.writeText(["name,wallet,claim_url", ...lines].join("\n"));
                }}
                className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink"
              >
                Copy all links
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {createdPayroll.claimLinks.map((link) => {
                const fullUrl =
                  typeof window === "undefined"
                    ? link.claimUrl
                    : `${window.location.origin}${link.claimUrl}`;
                return (
                  <div key={link.wallet} className="rounded-md border border-border bg-bg p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-ink">{link.name}</p>
                        <p className="font-mono text-xs text-ink-muted">
                          {link.wallet.slice(0, 8)}...{link.wallet.slice(-8)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(fullUrl)}
                        className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                      >
                        Copy link
                      </button>
                    </div>
                    <p className="mt-2 break-all font-mono text-xs text-ink-muted">{fullUrl}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/vault/${multisig}/proposals/${createdPayroll.transactionIndex}`}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-raise-1 transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.98]"
              >
                View proposal
              </Link>
              <button
                type="button"
                onClick={() => {
                  setCreatedPayroll(null);
                  setParsedNotes([]);
                  setRecipients([]);
                  setCsvText("");
                  setUploadTab("input");
                  setDryRunStatus("idle");
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
              >
                Create another payroll
              </button>
            </div>
          </PanelBody>
        </Panel>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="PAYROLL"
        title="Batch private settle"
        description="Upload CSV, build private notes, then submit for vault approval."
        action={
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
            Max 10
          </span>
        }
      />

      <div className="space-y-6">
        {/* Tab bar */}
        <div className="flex items-center gap-0.5 border-b border-border pb-1">
          <button
            type="button"
            onClick={() => setUploadTab("input")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              uploadTab === "input"
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            CSV Input
          </button>
        </div>

        {/* CSV INPUT TAB */}
        {uploadTab === "input" && (
          <Panel>
            <PanelHeader icon={Upload} title="Upload recipients" />
            <PanelBody className="space-y-5">
              <div>
                <Label htmlFor="csv-file">Upload CSV file</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="csv-text">Or paste CSV content</Label>
                <textarea
                  id="csv-text"
                  value={csvText}
                  onChange={handleCsvChange}
                  placeholder={formatPayrollCsvTemplate()}
                  rows={6}
                  className="mt-1 w-full rounded-md border border-border-strong bg-bg px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>

              {error && <InlineAlert tone="danger">{error}</InlineAlert>}

              <div>
                <Button
                  type="button"
                  disabled={recipients.length === 0}
                  onClick={() => {
                    setUploadTab("preview");
                    setConfirmChecked(false);
                    if (!pending && recipients.length > 0 && parsedNotes.length === 0) {
                      void buildNotes();
                    }
                  }}
                >
                  Next: Review →
                </Button>
              </div>
            </PanelBody>
          </Panel>
        )}

        {/* REVIEW TAB */}
        {uploadTab === "preview" && (
          <Panel>
            <PanelHeader icon={FileText} title="Review & build" />
            <PanelBody>
              <form onSubmit={submitPayroll} className="space-y-5">
                {recipients.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-sm text-ink-muted">No items yet</p>
                  </div>
                )}

                {dryRunStatus === "running" && (
                  <div className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink-muted">
                    Preparing review…
                  </div>
                )}

                {dryRunStatus === "ready" && parsedNotes.length > 0 && (
                  <div className="rounded-md border border-signal-positive/20 bg-signal-positive/10 px-3 py-2 text-sm text-signal-positive">
                    Review ready — all notes built.
                  </div>
                )}

                {recipients.length > 0 && (
                  <>
                    {/* 3-stat row */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-border bg-bg px-3 py-2">
                        <p className="text-xs text-ink-subtle">Recipients</p>
                        <p className="mt-1 font-mono text-lg font-semibold text-ink">
                          {recipients.length}/10
                        </p>
                      </div>
                      <div className="rounded-md border border-border bg-bg px-3 py-2">
                        <p className="text-xs text-ink-subtle">Total</p>
                        <p className="mt-1 font-mono text-lg font-semibold text-ink">
                          {lamportsToSol(totalAmount)} SOL
                        </p>
                      </div>
                      <div className="rounded-md border border-border bg-bg px-3 py-2">
                        <p className="text-xs text-ink-subtle">Commitments</p>
                        <p className="mt-1 font-mono text-lg font-semibold text-ink">
                          {recipients.length}
                        </p>
                      </div>
                    </div>

                    {/* Delivery mode */}
                    <fieldset className="grid gap-2">
                      <legend className="text-sm font-medium text-ink">Delivery mode</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setMode("direct")}
                          aria-pressed={mode === "direct"}
                          className={`min-h-16 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            mode === "direct"
                              ? "border-accent/25 bg-accent-soft text-accent"
                              : "border-border-strong bg-bg text-ink-muted hover:border-border-strong"
                          }`}
                        >
                          <span className="font-semibold">Direct send</span>
                          <span className="mt-0.5 block text-xs opacity-80">
                            Funds arrive automatically. No claim needed.
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode("invoice")}
                          aria-pressed={mode === "invoice"}
                          className={`min-h-16 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            mode === "invoice"
                              ? "border-accent/25 bg-accent-soft text-accent"
                              : "border-border-strong bg-bg text-ink-muted hover:border-border-strong"
                          }`}
                        >
                          <span className="font-semibold">Invoice / Claim</span>
                          <span className="mt-0.5 block text-xs opacity-80">
                            Create one claim link per recipient.
                          </span>
                        </button>
                      </div>
                    </fieldset>

                    {/* Recipients table */}
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-bg text-left">
                            <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              Row
                            </th>
                            <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              Recipient
                            </th>
                            <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              Wallet
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              Amount
                            </th>
                            <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/70">
                          {dryRunRows.map((row) => (
                            <tr key={`${row.wallet}-${row.index}`}>
                              <td className="px-3 py-2 font-mono text-xs text-ink-subtle">
                                {row.index + 1}
                              </td>
                              <td className="px-3 py-2 font-medium text-ink">{row.name}</td>
                              <td className="px-3 py-2 font-mono text-xs text-ink-muted">
                                {row.wallet.slice(0, 8)}...{row.wallet.slice(-8)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-ink">
                                {lamportsToSol(row.amount)} SOL
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                                    row.duplicate
                                      ? "bg-signal-warn/10 text-signal-warn"
                                      : "bg-accent-soft text-accent"
                                  }`}
                                >
                                  {row.duplicate ? "Duplicate wallet" : "Ready"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Build notes button */}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setUploadTab("input")}
                        disabled={pending}
                        className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                      >
                        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => void buildNotes()}
                        disabled={pending || duplicateWallets.size > 0 || zkWarmup === "warming"}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
                        title={zkWarmup === "warming" ? "Initializing ZK engine, please wait…" : undefined}
                      >
                        <PlayCircle className="h-4 w-4" />
                        {zkWarmup === "warming"
                          ? "Initializing ZK engine…"
                          : pending
                            ? "Preparing notes..."
                            : `Build ${recipients.length} private note${recipients.length !== 1 ? "s" : ""}`}
                      </button>
                    </div>

                    <label className="flex items-start gap-2 text-sm text-ink-muted">
                      <input
                        type="checkbox"
                        checked={confirmChecked}
                        onChange={(e) => setConfirmChecked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                      />
                      I confirm the recipient list and amounts are correct before creating this payroll.
                    </label>

                    {/* Submit button */}
                    {!pending && (
                      <div className="flex gap-3">
                        <Button
                          type="submit"
                          disabled={!confirmChecked || parsedNotes.length === 0}
                        >
                          Create payroll proposal
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* Error display */}
                {error && (
                  <pre className="whitespace-pre-wrap rounded-md border border-signal-danger/30 bg-signal-danger/15 p-3 text-xs text-signal-danger">
                    {error}
                  </pre>
                )}
              </form>
            </PanelBody>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}

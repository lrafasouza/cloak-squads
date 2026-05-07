"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenLogo } from "@/components/ui/token-logo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import {
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { RecipientInput } from "@/components/vault/RecipientInput";
import { ensureCircuitsProxy } from "@/lib/cloak-circuits-proxy";
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { useVaultTokens } from "@/lib/hooks/useVaultTokens";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import {
  type PayrollRecipientInput,
  formatPayrollCsvTemplate,
  parsePayrollCsv,
} from "@/lib/payroll-csv";
import { lamportsToSol } from "@/lib/sol";
import { createVaultProposal } from "@/lib/squads-sdk";
import { SOL_MINT, formatTokenAmount, tokenAmountToUnits } from "@/lib/tokens";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { assertCofreInitialized } from "@cloak-squads/core/cofre-status";
import { computePayloadHash } from "@cloak-squads/core/hashing";
import { cofrePda } from "@cloak-squads/core/pda";
import type { PayloadInvariants } from "@cloak-squads/core/types";
import {
  NATIVE_SOL_MINT,
  computeUtxoCommitment,
  createUtxo,
  generateUtxoKeypair,
} from "@cloak.dev/sdk-devnet";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  HelpCircle,
  List,
  PlayCircle,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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

function abbrev(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function displayAmount(amountStr: string, decimals: number, isSol: boolean): string {
  if (isSol) return lamportsToSol(amountStr);
  return formatTokenAmount(BigInt(amountStr), decimals);
}

type PayrollMode = "direct" | "invoice";

type ActiveTab = "recipients" | "review";

type PayrollClaimLink = {
  name: string;
  wallet: string;
  claimUrl: string;
};

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

  /* ── Core data ── */
  const [csvText, setCsvText] = useState("");
  const [recipients, setRecipients] = useState<PayrollRecipientInput[]>([]);
  const [parsedNotes, setParsedNotes] = useState<RecipientNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [dryRunStatus, setDryRunStatus] = useState<"idle" | "running" | "ready" | "error">("idle");
  const [zkWarmup, setZkWarmup] = useState<"idle" | "warming" | "ready">("idle");
  const [activeTab, setActiveTab] = useState<ActiveTab>("recipients");
  const [mode, setMode] = useState<PayrollMode>("direct");
  const [createdPayroll, setCreatedPayroll] = useState<{
    transactionIndex: string;
    claimLinks: PayrollClaimLink[];
  } | null>(null);
  // Payroll private sends are SOL-only on devnet; the Cloak shielded pool is
  // not initialized for SPL mints, so we lock the asset at the UI to avoid
  // creating proposals the operator cannot deliver.
  const selectedMint = SOL_MINT;
  const [selectedVaultIndex, setSelectedVaultIndex] = useState(0);
  const [subVaultAccounts, setSubVaultAccounts] = useState<
    Array<{ vaultIndex: number; name: string }>
  >([]);

  useEffect(() => {
    fetch(`/api/vaults/${multisig}/sub-vaults`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ vaultIndex: number; name: string }>) => setSubVaultAccounts(data))
      .catch(() => {});
  }, [multisig]);

  const allVaultAccounts = useMemo(
    () => [{ vaultIndex: 0, name: "Primary" }, ...subVaultAccounts],
    [subVaultAccounts],
  );

  /* ── Manual form ── */
  const [manualName, setManualName] = useState("");
  const [manualWallet, setManualWallet] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualMemo, setManualMemo] = useState("");

  /* ── CSV paste toggle ── */
  const [showCsvTextarea, setShowCsvTextarea] = useState(false);

  const { data: tokens = [] } = useVaultTokens(multisig, selectedVaultIndex);

  const selectedToken = useMemo(
    () => tokens.find((t) => t.mint === selectedMint) ?? tokens[0],
    [tokens, selectedMint],
  );

  const isSol = selectedMint === SOL_MINT;
  const tokenLabel = selectedToken?.symbol ?? "SOL";
  const decimals = selectedToken?.decimals ?? 9;

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

  const canAddManual = useMemo(() => {
    if (!manualName.trim() || !manualWallet.trim() || !manualAmount) return false;
    const num = Number.parseFloat(manualAmount);
    if (Number.isNaN(num) || num <= 0) return false;
    if (recipients.length >= 10) return false;
    return true;
  }, [manualName, manualWallet, manualAmount, recipients.length]);

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

  /* ── ZK warmup ── */
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

  /* ── Manual add / remove ── */
  function addManualRecipient() {
    if (!canAddManual) return;

    const trimmedWallet = manualWallet.trim();
    try {
      new PublicKey(trimmedWallet);
    } catch {
      setError("Invalid Solana wallet address.");
      return;
    }

    if (recipients.some((r) => r.wallet === trimmedWallet)) {
      setError("This wallet is already in the recipient list.");
      return;
    }

    try {
      const units = tokenAmountToUnits(manualAmount.trim(), decimals);
      const newRecipient: PayrollRecipientInput = {
        name: manualName.trim(),
        wallet: trimmedWallet,
        amount: units.toString(),
        memo: manualMemo.trim() || undefined,
      };
      setRecipients((prev) => [...prev, newRecipient]);
      setManualName("");
      setManualWallet("");
      setManualAmount("");
      setManualMemo("");
      setError(null);
    } catch {
      setError(`Invalid amount. Must be a positive number in ${tokenLabel}.`);
    }
  }

  function removeRecipient(index: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
    setParsedNotes([]);
    setDryRunStatus("idle");
  }

  function clearAllRecipients() {
    setRecipients([]);
    setParsedNotes([]);
    setCsvText("");
    setDryRunStatus("idle");
    setError(null);
  }

  /* ── CSV handlers ── */
  function handleCsvChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    setCsvText(text);
    setError(null);
    setParsedNotes([]);
    setCreatedPayroll(null);
    setDryRunStatus("idle");

    if (!text.trim()) {
      setRecipients([]);
      return;
    }

    const { data, errors } = parsePayrollCsv(text, decimals);
    if (errors.length > 0 && !data) {
      setError(errors.join("\n"));
      setRecipients([]);
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

  function downloadTemplate() {
    const blob = new Blob([formatPayrollCsvTemplate()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payroll-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ── Build notes ── */
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
        // Cloak relay can only deliver to Ed25519 wallets; reject PDAs early
        // so we don't strand SOL in the shielded pool at execute time.
        if (!PublicKey.isOnCurve(recipientPubkey.toBuffer())) {
          throw new Error(
            `${recipient.name || recipient.wallet.slice(0, 8)} is not an Ed25519 wallet (likely a PDA). Payroll private sends require standard wallets.`,
          );
        }
        const keypair = await generateUtxoKeypair();
        if (!selectedToken) throw new Error("Select a token.");
        const mint = isSol ? NATIVE_SOL_MINT : new PublicKey(selectedToken.mint);
        const amountUnits = BigInt(recipient.amount);
        const utxo = await createUtxo(amountUnits, keypair, mint);
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
          amount: amountUnits,
          tokenMint: mint,
          recipientVkPub: recipientPubkey.toBytes(),
          nonce: randomBytes(16),
        };

        const hash = computePayloadHash(invariants);
        const { instruction } = await buildIssueLicenseIxBrowser({
          multisig: multisigAddress,
          payloadHash: hash,
          nonce: invariants.nonce,
          vaultIndex: selectedVaultIndex,
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
  }, [multisigAddress, recipients, isSol, selectedToken]);

  /* ── Submit payroll ── */
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
      if (!selectedToken) throw new Error("Select a token.");

      const [vaultPda] = multisigSdk.getVaultPda({
        multisigPda: multisigAddress,
        index: selectedVaultIndex,
      });

      // Balance check
      if (isSol) {
        const vaultBalance = await connection.getBalance(vaultPda, "confirmed");
        if (BigInt(vaultBalance) < totalAmount) {
          const deficit = totalAmount - BigInt(vaultBalance);
          throw new Error(
            `Insufficient vault balance. Need ${lamportsToSol(totalAmount.toString())} SOL, vault has ${lamportsToSol(String(vaultBalance))} SOL. Short ${lamportsToSol(deficit.toString())} SOL.`,
          );
        }
      } else {
        if (totalAmount > selectedToken.balance) {
          throw new Error(
            `Insufficient ${tokenLabel}. Need ${formatTokenAmount(totalAmount, decimals)}, vault has ${selectedToken.uiBalance}.`,
          );
        }
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
      if (!cofreData?.operator)
        throw new Error("No operator registered. Set an operator wallet first.");
      const operatorPubkey = new PublicKey(cofreData.operator);

      // Build "fund operator" instruction — SOL or SPL token
      const proposalInstructions = [];
      if (isSol) {
        proposalInstructions.push(
          SystemProgram.transfer({
            fromPubkey: vaultPda,
            toPubkey: operatorPubkey,
            lamports: totalAmount,
          }),
        );
      } else {
        const mintPk = new PublicKey(selectedToken.mint);
        const vaultAta = await getAssociatedTokenAddress(mintPk, vaultPda, true);
        const operatorAta = await getAssociatedTokenAddress(mintPk, operatorPubkey);
        const operatorAtaInfo = await connection.getAccountInfo(operatorAta);
        if (!operatorAtaInfo) {
          proposalInstructions.push(
            createAssociatedTokenAccountInstruction(vaultPda, operatorAta, operatorPubkey, mintPk),
          );
        }
        proposalInstructions.push(
          createTransferCheckedInstruction(
            vaultAta,
            mintPk,
            operatorAta,
            vaultPda,
            totalAmount,
            decimals,
          ),
        );
      }

      updateStep("validate", { status: "success" });
      updateStep("squads", { status: "running" });

      const instructions = parsedNotes.map((n) => n.instruction);
      const result = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: [...proposalInstructions, ...instructions],
        memo: `payroll batch (${parsedNotes.length} recipients)`,
        vaultIndex: selectedVaultIndex,
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
          return { ...n, invoiceId: invoice.id };
        });
        updateStep("invoices", {
          status: "success",
          description: `${claimLinks.length} claim link${claimLinks.length === 1 ? "" : "s"} created.`,
        });
      } else {
        updateStep("invoices", { status: "success" });
      }

      updateStep("persist", { status: "running" });
      const draftPayload = {
        cofreAddress: multisigAddress.toBase58(),
        transactionIndex,
        memo: `payroll batch (${parsedNotes.length} recipients)`,
        totalAmount: totalAmountStr,
        mode,
        vaultIndex: selectedVaultIndex,
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

      for (let i = 0; i < parsedNotes.length; i++) {
        const n = parsedNotes[i];
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

  /* ── Early exits ── */
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
                  setActiveTab("recipients");
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
        title={`Batch private ${tokenLabel} settle`}
        description="Add recipients manually or import from CSV, build private notes, then submit for vault approval."
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
            onClick={() => setActiveTab("recipients")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "recipients"
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Recipients
            {recipients.length > 0 && (
              <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-ink">
                {recipients.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (recipients.length > 0) {
                setActiveTab("review");
                setConfirmChecked(false);
              }
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "review"
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            } ${recipients.length === 0 ? "cursor-not-allowed opacity-40" : ""}`}
          >
            <FileText className="h-3.5 w-3.5" />
            Review
          </button>
        </div>

        {/* ── RECIPIENTS TAB ── */}
        {activeTab === "recipients" && (
          <div className="space-y-6">
            {/* Vault source selector — shown when sub-vaults exist */}
            {subVaultAccounts.length > 0 && (
              <div>
                <Label>From account</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {allVaultAccounts.map((acct) => (
                    <button
                      key={acct.vaultIndex}
                      type="button"
                      disabled={pending}
                      onClick={() => setSelectedVaultIndex(acct.vaultIndex)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        selectedVaultIndex === acct.vaultIndex
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink"
                      }`}
                    >
                      {acct.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual add form */}
            <Panel>
              <PanelHeader icon={UserPlus} title="Add recipient" />
              <PanelBody className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="payroll-name">Name</Label>
                    <Input
                      id="payroll-name"
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="e.g. Alice, Treasury"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="payroll-wallet">Wallet</Label>
                    <div className="mt-1.5">
                      <RecipientInput
                        id="payroll-wallet"
                        value={manualWallet}
                        onChange={setManualWallet}
                        placeholder="Solana address or saved contact"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor="payroll-amount">Amount ({tokenLabel})</Label>
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-ink">
                        <TokenLogo symbol="SOL" size={16} />
                        SOL
                      </div>
                      <Input
                        id="payroll-amount"
                        type="number"
                        step={isSol ? "0.000000001" : "0.000001"}
                        min={isSol ? "0.000000001" : "0.000001"}
                        value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value)}
                        placeholder={isSol ? "0.5" : "0.00"}
                        className="flex-1 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="payroll-memo">Memo (optional)</Label>
                    <Input
                      id="payroll-memo"
                      type="text"
                      value={manualMemo}
                      onChange={(e) => setManualMemo(e.target.value)}
                      placeholder="Monthly salary"
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="button" onClick={addManualRecipient} disabled={!canAddManual}>
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    Add recipient
                  </Button>
                  <span className="text-xs text-ink-muted">{recipients.length}/10 recipients</span>
                </div>
              </PanelBody>
            </Panel>

            {/* Recipients list */}
            {recipients.length > 0 && (
              <Panel>
                <PanelHeader
                  icon={List}
                  title={`Recipients · ${recipients.length}/10`}
                  action={
                    <button
                      type="button"
                      onClick={clearAllRecipients}
                      className="text-xs text-signal-danger hover:underline"
                    >
                      Clear all
                    </button>
                  }
                />
                <PanelBody>
                  <div className="divide-y divide-border">
                    {recipients.map((r, i) => (
                      <div
                        key={`${r.wallet}-${i}`}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">{r.name}</span>
                            {duplicateWallets.has(r.wallet) && (
                              <span className="rounded-full bg-signal-warn/10 px-1.5 py-0.5 text-[10px] font-bold text-signal-warn">
                                Duplicate
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            <span className="font-mono">{abbrev(r.wallet)}</span>
                            {" · "}
                            <span className="font-mono font-medium text-ink">
                              {displayAmount(r.amount, decimals, isSol)} {tokenLabel}
                            </span>
                            {r.memo ? ` · ${r.memo}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRecipient(i)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-signal-danger/15 hover:text-signal-danger transition-colors"
                          aria-label={`Remove ${r.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </PanelBody>
              </Panel>
            )}

            {/* CSV import */}
            <Panel>
              <PanelHeader
                icon={Upload}
                title="Or import from CSV"
                action={
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download template
                  </button>
                }
              />
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
                  {!showCsvTextarea ? (
                    <button
                      type="button"
                      onClick={() => setShowCsvTextarea(true)}
                      className="text-sm text-accent transition-colors hover:text-accent-hover"
                    >
                      Or paste CSV content
                    </button>
                  ) : (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <Label htmlFor="csv-text">Paste CSV content</Label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCsvTextarea(false);
                            setCsvText("");
                            setRecipients((prev) =>
                              prev.filter((r) => r.name !== "__csv_import__"),
                            );
                          }}
                          className="text-xs text-ink-muted hover:text-ink"
                        >
                          Hide
                        </button>
                      </div>
                      <textarea
                        id="csv-text"
                        value={csvText}
                        onChange={handleCsvChange}
                        placeholder={formatPayrollCsvTemplate()}
                        rows={6}
                        className="w-full rounded-md border border-border-strong bg-bg px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                    </div>
                  )}
                </div>

                {error && <InlineAlert tone="danger">{error}</InlineAlert>}
              </PanelBody>
            </Panel>

            {/* Next button */}
            {recipients.length > 0 && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => {
                    setActiveTab("review");
                    setConfirmChecked(false);
                  }}
                >
                  Next: Review →
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── REVIEW TAB ── */}
        {activeTab === "review" && (
          <Panel>
            <PanelHeader icon={FileText} title="Review & confirm" />
            <PanelBody>
              <form onSubmit={submitPayroll} className="space-y-7">
                {recipients.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-sm text-ink-muted">
                      No recipients yet. Go back to add some.
                    </p>
                  </div>
                )}

                {dryRunStatus === "running" && (
                  <InlineAlert tone="info">Building private commitments…</InlineAlert>
                )}
                {dryRunStatus === "ready" && parsedNotes.length > 0 && (
                  <InlineAlert tone="success">
                    All {parsedNotes.length} private note{parsedNotes.length === 1 ? "" : "s"}{" "}
                    ready.
                  </InlineAlert>
                )}

                {recipients.length > 0 && (
                  <>
                    {/* Inline summary — values, no cards */}
                    <div className="grid grid-cols-3 gap-x-6 gap-y-3 sm:gap-x-10">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                          Total payout
                        </p>
                        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
                          {displayAmount(totalAmount.toString(), decimals, isSol)}
                          <span className="ml-1.5 text-sm font-normal text-ink-muted">
                            {tokenLabel}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                          Recipients
                        </p>
                        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
                          {recipients.length}
                          <span className="text-sm font-normal text-ink-muted">/10</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                          Private notes
                        </p>
                        <p
                          className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                            parsedNotes.length === recipients.length && parsedNotes.length > 0
                              ? "text-signal-positive"
                              : "text-ink-muted"
                          }`}
                        >
                          {parsedNotes.length}
                          <span className="text-sm font-normal text-ink-muted">
                            /{recipients.length}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Delivery mode */}
                    <fieldset>
                      <legend className="text-sm font-semibold text-ink">Delivery mode</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {(["direct", "invoice"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMode(m)}
                            aria-pressed={mode === m}
                            className={`relative flex flex-col gap-1 rounded-lg border px-4 py-3.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              mode === m
                                ? "border-accent/30 bg-accent-soft"
                                : "border-border bg-bg hover:border-border-strong"
                            }`}
                          >
                            <span
                              className={`font-semibold ${mode === m ? "text-accent" : "text-ink"}`}
                            >
                              {m === "direct" ? "Direct send" : "Invoice / Claim"}
                            </span>
                            <span
                              className={`text-xs leading-relaxed ${
                                mode === m ? "text-accent/80" : "text-ink-muted"
                              }`}
                            >
                              {m === "direct"
                                ? "Funds arrive automatically after approval."
                                : "Each recipient gets a private claim link."}
                            </span>
                            {mode === m && (
                              <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-accent">
                                <CheckCircle2 className="h-2.5 w-2.5 text-accent-ink" />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    {/* Recipients table */}
                    <div>
                      <p className="mb-2 text-sm font-semibold text-ink">Recipients</p>
                      <div className="overflow-hidden rounded-lg border border-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-surface-2/40 text-left">
                              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                                #
                              </th>
                              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                                Recipient
                              </th>
                              <th className="hidden px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle sm:table-cell">
                                Wallet
                              </th>
                              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                                Amount
                              </th>
                              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                                Note
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {dryRunRows.map((row) => (
                              <tr
                                key={`${row.wallet}-${row.index}`}
                                className="transition-colors hover:bg-surface-2/30"
                              >
                                <td className="px-4 py-3 font-mono text-xs text-ink-subtle">
                                  {row.index + 1}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-medium text-ink">{row.name}</span>
                                  {row.duplicate && (
                                    <span className="ml-1.5 rounded-full bg-signal-warn/10 px-1.5 py-0.5 text-[9px] font-bold text-signal-warn">
                                      Duplicate
                                    </span>
                                  )}
                                </td>
                                <td className="hidden px-4 py-3 font-mono text-xs text-ink-muted sm:table-cell">
                                  {row.wallet.slice(0, 6)}…{row.wallet.slice(-6)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-sm font-medium tabular-nums text-ink">
                                  {displayAmount(row.amount, decimals, isSol)}
                                  <span className="ml-1 text-xs font-normal text-ink-muted">
                                    {tokenLabel}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {parsedNotes[row.index] ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-signal-positive">
                                      <span className="h-1 w-1 rounded-full bg-signal-positive" />
                                      Built
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-ink-subtle">
                                      Pending
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Build step — clean row, (?) reveals explanation on hover */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-ink">
                          {parsedNotes.length === recipients.length && parsedNotes.length > 0
                            ? `${parsedNotes.length} private commitment${parsedNotes.length !== 1 ? "s" : ""} ready`
                            : "Run build notes before submitting"}
                        </p>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label='Why "Build notes"?'
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                <HelpCircle className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start" className="max-w-xs">
                              <p className="font-semibold text-ink">Why "Build notes"?</p>
                              <p className="mt-1 leading-relaxed text-ink-muted">
                                Each recipient needs a unique zero-knowledge commitment generated
                                locally in your browser. This is what hides amounts and recipient
                                identities on-chain, nothing leaves your browser until you submit.
                                Generation takes ~1s per recipient.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <button
                        type="button"
                        onClick={() => void buildNotes()}
                        disabled={pending || duplicateWallets.size > 0 || zkWarmup === "warming"}
                        title={
                          zkWarmup === "warming"
                            ? "Initializing ZK engine, please wait…"
                            : undefined
                        }
                        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-border-strong bg-bg px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <PlayCircle className="h-3.5 w-3.5 shrink-0" />
                        {zkWarmup === "warming"
                          ? "Initializing…"
                          : pending
                            ? "Building…"
                            : parsedNotes.length === recipients.length && parsedNotes.length > 0
                              ? "Rebuild notes"
                              : `Run build notes (${recipients.length})`}
                      </button>
                    </div>

                    {/* Confirm + submit — bottom action bar */}
                    <div className="flex flex-col gap-4 border-t border-border pt-5">
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={confirmChecked}
                          onChange={(e) => setConfirmChecked(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                          disabled={parsedNotes.length === 0}
                        />
                        <span className="text-sm text-ink-muted">
                          I confirm the recipient list and amounts are correct before creating this
                          payroll.
                        </span>
                      </label>
                      {!pending && (
                        <div className="flex items-center gap-3">
                          <Button
                            type="submit"
                            disabled={!confirmChecked || parsedNotes.length === 0}
                          >
                            Create payroll proposal
                          </Button>
                          <button
                            type="button"
                            onClick={() => setActiveTab("recipients")}
                            className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {error && (
                  <pre className="whitespace-pre-wrap rounded-lg border border-signal-danger/30 bg-signal-danger/10 p-4 text-xs text-signal-danger">
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

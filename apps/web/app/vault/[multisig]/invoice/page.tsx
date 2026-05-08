"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptRow } from "@/components/ui/receipt-row";
import { useToast } from "@/components/ui/toast-provider";
import { TokenLogo } from "@/components/ui/token-logo";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { InlineAlert, WorkspacePage } from "@/components/ui/workspace";
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { useVaultTokens } from "@/lib/hooks/useVaultTokens";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import { lamportsToSol } from "@/lib/sol";
import { createVaultProposal } from "@/lib/squads-sdk";
import { SOL_MINT, tokenAmountToUnits } from "@/lib/tokens";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import {
  MIN_PRIVATE_DEPOSIT_LAMPORTS,
  MIN_PRIVATE_DEPOSIT_SOL,
  assertPrivateSolMinimum,
  solAmountToLamports,
} from "@cloak-squads/core/amount";
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
import { AlertTriangle, BookOpen, CheckCircle2, Copy, Link2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { type FormEvent, use, useCallback, useEffect, useMemo, useState } from "react";

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export default function InvoicePage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const [invoiceRef, setInvoiceRef] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [recipientWallet, setRecipientWallet] = useState("");
  const [invoiceMode, setInvoiceMode] = useState<"bound" | "bearer">("bound");
  const [bearerExpiryHours, setBearerExpiryHours] = useState<number>(24);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [claimQrDataUrl, setClaimQrDataUrl] = useState<string | null>(null);
  // Stealth invoices are SOL-only on devnet; the Cloak shielded pool is not
  // initialized for SPL mints, so we lock the asset at the UI to avoid
  // creating proposals the operator cannot deliver.
  const selectedMint = SOL_MINT;
  const [selectedVaultIndex, setSelectedVaultIndex] = useState(0);
  const [subVaultAccounts, setSubVaultAccounts] = useState<
    Array<{ vaultIndex: number; name: string }>
  >([]);
  const [result, setResult] = useState<{
    claimUrl: string;
    transactionIndex: string;
  } | null>(null);

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

  const { data: tokens = [] } = useVaultTokens(multisig, selectedVaultIndex);

  const selectedToken = useMemo(
    () => tokens.find((t) => t.mint === selectedMint) ?? tokens[0],
    [tokens, selectedMint],
  );

  const isSol = selectedMint === SOL_MINT;
  const tokenLabel = selectedToken?.symbol ?? "SOL";

  const amountStep = isSol ? "0.000000001" : "0.000001";
  const amountMin = isSol ? "0.01" : "0.000001";
  const amountPlaceholder = isSol ? "0.0" : "0.00";

  const belowPrivateMin = useMemo(() => {
    if (!isSol || !amount.trim()) return false;
    try {
      return solAmountToLamports(amount) < MIN_PRIVATE_DEPOSIT_LAMPORTS;
    } catch {
      return false;
    }
  }, [isSol, amount]);

  const handleMaxAmount = useCallback(() => {
    if (selectedToken) setAmount(selectedToken.uiBalance);
  }, [selectedToken]);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowConfirm(true);
  }

  async function executeCreate() {
    setShowConfirm(false);
    setConfirmChecked(false);
    setError(null);
    setResult(null);
    setPending(true);
    startTransaction({
      title: "Creating stealth invoice",
      description: "Creating the private invoice record and opening a Squads proposal.",
      steps: [
        {
          id: "validate",
          title: "Validate invoice",
          description: "Checking wallet, amount, recipient, and vault readiness.",
        },
        {
          id: "invoice",
          title: "Create claim link",
          description: "Creating the encrypted invoice record.",
          status: "pending",
        },
        {
          id: "commitment",
          title: "Build private commitment",
          description: "Creating the Cloak commitment signers will approve.",
          status: "pending",
        },
        {
          id: "proposal",
          title: "Create Squads proposal",
          description: "Your wallet signs the license proposal transaction.",
          status: "pending",
        },
        {
          id: "persist",
          title: "Save execution draft",
          description: "Saving the data needed by the operator and claimant.",
          status: "pending",
        },
      ],
    });

    try {
      if (!multisigAddress) throw new Error("Invalid multisig address.");
      if (!wallet.publicKey) throw new Error("Connect a multisig member wallet first.");
      if (!selectedToken) throw new Error("Select a token.");
      if (invoiceMode === "bound" && !recipientWallet.trim()) {
        throw new Error("Recipient wallet is required for bound invoices.");
      }

      const decimals = selectedToken.decimals;
      const tokenUnits = isSol ? solAmountToLamports(amount) : tokenAmountToUnits(amount, decimals);

      if (isSol) assertPrivateSolMinimum(tokenUnits);

      const [vaultPda] = multisigSdk.getVaultPda({
        multisigPda: multisigAddress,
        index: selectedVaultIndex,
      });

      // Balance check
      if (isSol) {
        const vaultBalance = await connection.getBalance(vaultPda, "confirmed");
        if (BigInt(vaultBalance) < tokenUnits) {
          const deficit = tokenUnits - BigInt(vaultBalance);
          throw new Error(
            `Insufficient vault balance. Need ${lamportsToSol(String(tokenUnits))} SOL, vault has ${lamportsToSol(String(vaultBalance))} SOL. Short ${lamportsToSol(String(deficit))} SOL.`,
          );
        }
      } else {
        if (tokenUnits > selectedToken.balance) {
          throw new Error(
            `Insufficient ${tokenLabel}. Need ${amount}, vault has ${selectedToken.uiBalance}.`,
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
            lamports: tokenUnits,
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
            tokenUnits,
            decimals,
          ),
        );
      }

      updateStep("validate", { status: "success" });

      updateStep("invoice", { status: "running" });

      // Step 1: Create StealthInvoice in DB
      const stealthRes = await fetchWithAuth("/api/stealth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          invoiceRef: invoiceRef.trim() || undefined,
          memo: memo.trim() || undefined,
          amount: tokenUnits.toString(),
          mode: invoiceMode,
          ...(invoiceMode === "bound" ? { recipientWallet: recipientWallet.trim() } : {}),
          ...(invoiceMode === "bearer" ? { expiresInHours: bearerExpiryHours } : {}),
          vaultIndex: selectedVaultIndex,
        }),
      });
      if (!stealthRes.ok) {
        const data = (await stealthRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to create stealth invoice.");
      }
      const stealthData = (await stealthRes.json()) as {
        id: string;
        stealthPubkey: string;
        claimUrl: string;
      };
      updateStep("invoice", { status: "success", description: "Claim link created." });
      updateStep("commitment", { status: "running" });

      // Resolve the viewing key bound into the UTXO commitment.
      // - Bound mode: the recipient wallet picked at create time.
      // - Bearer mode: the stealth box public key returned by the API. The
      //   matching secret lives in the URL fragment, so anyone with the link
      //   can prove ownership at claim time. The actual destination wallet is
      //   chosen at claim time (passed as the fullWithdraw destination).
      const recipientPubkey =
        invoiceMode === "bound"
          ? new PublicKey(recipientWallet.trim())
          : new PublicKey(stealthData.stealthPubkey);

      // Step 2: Generate Cloak UTXO commitment
      const keypair = await generateUtxoKeypair();
      const cloakMint = isSol ? NATIVE_SOL_MINT : new PublicKey(selectedToken.mint);
      const utxo = await createUtxo(tokenUnits, keypair, cloakMint);
      const commitmentBigInt = await computeUtxoCommitment(utxo);
      const commitment = commitmentBigInt.toString(16).padStart(64, "0");

      const invariants: PayloadInvariants = {
        nullifier: randomBytes(32),
        commitment: hexToBytes(commitment),
        amount: tokenUnits,
        tokenMint: cloakMint,
        recipientVkPub: recipientPubkey.toBytes(),
        nonce: randomBytes(16),
      };
      updateStep("commitment", { status: "success" });

      updateStep("proposal", { status: "running" });

      // Step 3: Build gatekeeper instruction + Squads proposal
      const hash = computePayloadHash(invariants);
      const { instruction: licenseIx } = await buildIssueLicenseIxBrowser({
        multisig: multisigAddress,
        payloadHash: hash,
        nonce: invariants.nonce,
        vaultIndex: selectedVaultIndex,
      });
      proposalInstructions.push(licenseIx);

      const proposalResult = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: proposalInstructions,
        memo: memo.trim()
          ? `stealth invoice: ${memo.trim()}`
          : `stealth invoice ${stealthData.id.slice(0, 8)}`,
        vaultIndex: selectedVaultIndex,
      });
      updateStep("proposal", {
        status: "success",
        signature: proposalResult.signature,
        description: `Proposal #${proposalResult.transactionIndex.toString()} confirmed.`,
      });

      const transactionIndex = proposalResult.transactionIndex.toString();
      const claim = {
        invoiceId: stealthData.id,
        amount: invariants.amount.toString(),
        keypairPrivateKey: keypair.privateKey.toString(16).padStart(64, "0"),
        keypairPublicKey: keypair.publicKey.toString(16).padStart(64, "0"),
        blinding: utxo.blinding.toString(16).padStart(64, "0"),
        commitment,
        recipient_vk: recipientPubkey.toBase58(),
        token_mint: cloakMint.toBase58(),
      };

      updateStep("persist", { status: "running" });
      // Step 4: Persist ProposalDraft
      const draftRes = await fetchWithAuth("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          transactionIndex,
          amount: tokenUnits.toString(),
          recipient: recipientPubkey.toBase58(),
          memo: memo.trim() || undefined,
          payloadHash: Array.from(hash),
          invariants: {
            nullifier: Array.from(invariants.nullifier),
            commitment: Array.from(invariants.commitment),
            amount: invariants.amount.toString(),
            tokenMint: invariants.tokenMint.toBase58(),
            recipientVkPub: Array.from(invariants.recipientVkPub),
            nonce: Array.from(invariants.nonce),
          },
          commitmentClaim: claim,
          signature: proposalResult.signature,
          vaultIndex: selectedVaultIndex,
        }),
      });
      if (!draftRes.ok) {
        const body = (await draftRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not persist proposal draft.");
      }

      // Step 5: Cache claim secrets in sessionStorage
      try {
        sessionStorage.setItem(
          `claim:${multisigAddress.toBase58()}:${transactionIndex}`,
          JSON.stringify(claim),
        );
      } catch {
        /* sessionStorage full or unavailable */
      }

      updateStep("persist", { status: "success" });
      completeTransaction({
        title: "Stealth invoice ready",
        description: `Proposal #${transactionIndex} is ready and the claim link can be shared.`,
      });
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      setResult({ claimUrl: stealthData.claimUrl, transactionIndex });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not create stealth invoice.";
      setError(message);
      failTransaction(message);
    } finally {
      setPending(false);
    }
  }

  const handleCopyClaimUrl = async () => {
    if (!result) return;
    const fullUrl = `${window.location.origin}${result.claimUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    addToast("Claim link copied!", "success", 3000);
  };

  useEffect(() => {
    if (!result || typeof window === "undefined") {
      setClaimQrDataUrl(null);
      return;
    }
    const fullClaimUrl = `${window.location.origin}${result.claimUrl}`;
    let cancelled = false;
    void QRCode.toDataURL(fullClaimUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 180,
      color: {
        dark: "#0A0A0B",
        light: "#FFFFFF",
      },
    }).then((dataUrl) => {
      if (!cancelled) setClaimQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

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

  // After success: show claim URL + link to proposal
  if (result) {
    const fullClaimUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${result.claimUrl}`;
    return (
      <WorkspacePage>
        <div className="space-y-6">
          {/* ── Hero · Settled crest ── */}
          <section className="card-hero relative">
            <HeraldicWatermark size={300} opacity={0.04} />
            <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-center md:gap-6 md:p-7">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-accent-soft text-accent shadow-raise-1">
                <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-eyebrow text-accent">Stealth invoice · sealed</p>
                <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  Invoice sealed
                </h1>
                <p className="mt-1.5 text-sm text-ink-muted">
                  Share the claim link before continuing. The recipient needs it after the proposal
                  is executed.
                </p>
              </div>
              <span className="self-start rounded-full border border-brass/30 bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-eyebrow text-accent md:self-auto">
                Proposal #{result.transactionIndex}
              </span>
            </div>
          </section>

          {/* ── Claim link card · QR + URL + actions ── */}
          <div className="card-panel overflow-hidden">
            <header className="border-b border-border/60 px-5 py-3.5">
              <p className="text-eyebrow">Claim link · ready to share</p>
            </header>
            <div className="space-y-4 p-5">
              {claimQrDataUrl ? (
                <div className="flex justify-center">
                  <img
                    src={claimQrDataUrl}
                    alt="Claim link QR code"
                    className="h-[180px] w-[180px] rounded-list border border-border bg-white p-2 shadow-raise-1"
                  />
                </div>
              ) : null}
              <div className="rounded-list border border-brass/25 bg-accent-soft px-3 py-2.5">
                <p className="text-eyebrow mb-1 text-accent">Claim URL</p>
                <p className="break-all font-mono text-xs leading-relaxed text-accent">
                  {fullClaimUrl}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="outline" onClick={handleCopyClaimUrl}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy claim link
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    router.push(`/vault/${multisig}/proposals/${result.transactionIndex}`)
                  }
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Go to proposal #{result.transactionIndex}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </WorkspacePage>
    );
  }

  const previewAmount = amount ? `${amount} ${tokenLabel}` : "—";
  const previewRecipient =
    invoiceMode === "bearer"
      ? "Bearer · anyone with link"
      : recipientWallet
        ? recipientWallet.length > 12
          ? `${recipientWallet.slice(0, 6)}…${recipientWallet.slice(-4)}`
          : recipientWallet
        : "—";
  const previewExpiry =
    invoiceMode === "bearer"
      ? bearerExpiryHours >= 24
        ? `${bearerExpiryHours / 24} day${bearerExpiryHours / 24 !== 1 ? "s" : ""}`
        : `${bearerExpiryHours} hour${bearerExpiryHours !== 1 ? "s" : ""}`
      : "7 days";
  const previewSourceVault =
    allVaultAccounts.find((a) => a.vaultIndex === selectedVaultIndex)?.name ?? "Primary";

  return (
    <WorkspacePage>
      <div className="space-y-6">
        {/* ── Hero · Identity-locked invoice crest ── */}
        <section className="card-hero relative">
          <HeraldicWatermark size={300} opacity={0.04} />
          <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-center md:gap-6 md:p-7">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-accent-soft text-accent shadow-raise-1">
              <BookOpen className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-eyebrow">Stealth invoice · {tokenLabel} claim link</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                Issue a private claim
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">
                Generate a sealed claim link and open a Squads proposal for signer approval.
              </p>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-5">
          {/* ── Form column ── */}
          <div className="space-y-4 lg:col-span-3">
            {/* Mode cards */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInvoiceMode("bound")}
                disabled={pending}
                className={`flex flex-col items-start gap-1 rounded-list border px-3.5 py-3 text-left text-sm transition-aegis disabled:cursor-not-allowed ${
                  invoiceMode === "bound"
                    ? "border-brass/40 bg-accent-soft text-ink shadow-raise-1"
                    : "border-border bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                <span className="font-semibold">Bound to wallet</span>
                <span className="text-[11px] leading-snug text-ink-subtle">
                  Recipient locked at create time. 7-day expiry.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setInvoiceMode("bearer")}
                disabled={pending}
                className={`flex flex-col items-start gap-1 rounded-list border px-3.5 py-3 text-left text-sm transition-aegis disabled:cursor-not-allowed ${
                  invoiceMode === "bearer"
                    ? "border-accent bg-accent-soft text-ink shadow-raise-1"
                    : "border-border bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                <span className="font-semibold">Bearer link</span>
                <span className="text-[11px] leading-snug text-ink-subtle">
                  Anyone with the link picks the destination at claim time.
                </span>
              </button>
            </div>

            {invoiceMode === "bearer" && (
              <div className="flex gap-2 rounded-list border border-signal-warn/30 bg-signal-warn/5 px-3 py-2.5 text-[11px] leading-relaxed text-ink-muted">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-warn" />
                <span>
                  <span className="font-medium text-ink">Bearer cash.</span> Anyone with the link
                  can claim. Treat the URL as a private secret. Share over a confidential channel
                  and use a short expiry.
                </span>
              </div>
            )}

            {/* Form panel */}
            <div className="card-panel overflow-hidden">
              <header className="border-b border-border/60 px-5 py-3.5">
                <p className="text-eyebrow">Invoice details</p>
              </header>
              <div className="space-y-5 p-5">
                {/* Vault source selector */}
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
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-aegis disabled:cursor-not-allowed disabled:opacity-40 ${
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

                <div>
                  <Label htmlFor="invoiceRef">Invoice reference</Label>
                  <Input
                    id="invoiceRef"
                    type="text"
                    autoComplete="off"
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    placeholder="Optional reference number"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="memo">Memo</Label>
                  <Input
                    id="memo"
                    type="text"
                    autoComplete="off"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="Optional description"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="amount">Amount</Label>
                    <button
                      type="button"
                      className="text-xs font-mono text-accent hover:text-accent-hover disabled:opacity-50"
                      onClick={handleMaxAmount}
                      disabled={pending || !selectedToken}
                    >
                      {selectedToken
                        ? `${selectedToken.uiBalance} ${selectedToken.symbol} available`
                        : "-"}
                    </button>
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-ink">
                      <TokenLogo symbol="SOL" size={16} />
                      SOL
                    </div>
                    <Input
                      id="amount"
                      type="number"
                      step={amountStep}
                      min={amountMin}
                      placeholder={amountPlaceholder}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1 font-mono"
                      aria-invalid={belowPrivateMin || undefined}
                    />
                  </div>
                  {belowPrivateMin && (
                    <p className="mt-1.5 text-xs text-signal-danger">
                      Increase to at least {MIN_PRIVATE_DEPOSIT_SOL} SOL — Cloak rejects smaller
                      private deposits.
                    </p>
                  )}
                </div>

                {invoiceMode === "bound" ? (
                  <div>
                    <Label htmlFor="recipient">Recipient wallet</Label>
                    <Input
                      id="recipient"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={recipientWallet}
                      onChange={(e) => setRecipientWallet(e.target.value)}
                      placeholder="Solana wallet address"
                      className="mt-1.5 font-mono"
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="bearerExpiry">Link expires in</Label>
                    <select
                      id="bearerExpiry"
                      value={bearerExpiryHours}
                      onChange={(e) => setBearerExpiryHours(Number(e.target.value))}
                      className="mt-1.5 block w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <option value={1}>1 hour</option>
                      <option value={6}>6 hours</option>
                      <option value={24}>24 hours (default)</option>
                      <option value={72}>3 days</option>
                      <option value={168}>7 days</option>
                      <option value={720}>30 days (max)</option>
                    </select>
                    <p className="mt-1 text-[11px] text-ink-subtle">
                      Shorter expiry limits the blast radius if the link leaks.
                    </p>
                  </div>
                )}

                {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
              </div>
            </div>
          </div>

          {/* ── Receipt sidebar · sticky ──
              Live "what you'll seal" preview, mirroring send page pattern. */}
          <aside className="space-y-4 lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
            <div className="card-panel relative overflow-hidden p-5">
              <HeraldicWatermark size={140} opacity={0.05} />
              <div className="relative">
                <p className="text-eyebrow">Receipt · what you'll seal</p>
                <div className="mt-3 space-y-1">
                  <ReceiptRow label="Amount">{previewAmount}</ReceiptRow>
                  <ReceiptRow label="To" mono={false}>
                    <span className={invoiceMode === "bearer" ? "" : "font-mono"}>
                      {previewRecipient}
                    </span>
                  </ReceiptRow>
                  <ReceiptRow label="Mode" mono={false}>
                    {invoiceMode === "bound" ? "Bound to wallet" : "Bearer link"}
                  </ReceiptRow>
                  <ReceiptRow label="Expires" mono={false}>
                    {previewExpiry}
                  </ReceiptRow>
                  {invoiceRef && (
                    <ReceiptRow label="Reference" mono={false}>
                      {invoiceRef}
                    </ReceiptRow>
                  )}
                  {memo && (
                    <ReceiptRow label="Memo" mono={false}>
                      {memo}
                    </ReceiptRow>
                  )}
                  <ReceiptRow label="From" mono={false}>
                    {previewSourceVault}
                  </ReceiptRow>
                  <ReceiptRow label="Privacy" mono={false} tone="accent">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      Shielded via Cloak
                    </span>
                  </ReceiptRow>
                </div>
              </div>
            </div>

            <div className="card-panel p-5">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                />
                <span className="flex-1">
                  {invoiceMode === "bound"
                    ? "I confirm the recipient and amount are correct before creating this invoice."
                    : "I understand anyone with this link can claim. I'll share it over a private channel."}
                </span>
              </label>

              <div className="mt-4 space-y-2">
                {!pending && (
                  <Button
                    type="submit"
                    disabled={
                      !confirmChecked ||
                      !amount ||
                      (invoiceMode === "bound" && !recipientWallet) ||
                      !wallet.publicKey ||
                      belowPrivateMin
                    }
                    className="w-full"
                  >
                    Create invoice + proposal
                  </Button>
                )}
              </div>

              {!wallet.publicKey ? (
                <p className="mt-3 text-xs text-signal-warn">
                  Connect a multisig member wallet first.
                </p>
              ) : null}
            </div>
          </aside>
        </form>

        <ConfirmModal
          open={showConfirm}
          title="Create invoice"
          description={`This creates a claim link and opens a proposal for ${amount || "0"} ${tokenLabel}.`}
          confirmText="Create"
          cancelText="Cancel"
          onConfirm={executeCreate}
          onCancel={() => setShowConfirm(false)}
          isLoading={pending}
        />
      </div>
    </WorkspacePage>
  );
}

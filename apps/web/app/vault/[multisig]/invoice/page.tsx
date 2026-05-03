"use client";

import { ProofGenerationState, type ProofStepId } from "@/components/proof/ProofGenerationState";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import {
  InlineAlert,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";
import { BookOpen, CheckCircle2, Copy, Link2 } from "lucide-react";
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import { createVaultProposal } from "@/lib/squads-sdk";
import { lamportsToSol } from "@/lib/sol";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { solAmountToLamports } from "@cloak-squads/core/amount";
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
import * as multisigSdk from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { type FormEvent, use, useEffect, useMemo, useState } from "react";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [proofStep, setProofStep] = useState<ProofStepId | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [claimQrDataUrl, setClaimQrDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{
    claimUrl: string;
    transactionIndex: string;
  } | null>(null);

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
    setProofStep("load-circuits");
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

      const lamports = solAmountToLamports(amount);
      const recipientPubkey = new PublicKey(recipientWallet.trim());

      const [vaultPda] = multisigSdk.getVaultPda({ multisigPda: multisigAddress, index: 0 });
      const vaultBalance = await connection.getBalance(vaultPda, "confirmed");
      if (BigInt(vaultBalance) < lamports) {
        const deficit = lamports - BigInt(vaultBalance);
        throw new Error(
          `Insufficient vault balance. Need ${lamportsToSol(String(lamports))} SOL, vault has ${lamportsToSol(String(vaultBalance))} SOL. Short ${lamportsToSol(String(deficit))} SOL.`,
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
        lamports,
      });

      updateStep("validate", { status: "success" });

      setProofStep("generate-witness");
      updateStep("invoice", { status: "running" });

      // Step 1: Create StealthInvoice in DB (server generates nacl keypair + claim URL)
      const stealthRes = await fetchWithAuth("/api/stealth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          invoiceRef: invoiceRef.trim() || undefined,
          memo: memo.trim() || undefined,
          amount: lamports.toString(),
          recipientWallet: recipientPubkey.toBase58(),
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

      // Step 2: Generate Cloak UTXO commitment
      const keypair = await generateUtxoKeypair();
      const mint = NATIVE_SOL_MINT;
      const utxo = await createUtxo(lamports, keypair, mint);
      const commitmentBigInt = await computeUtxoCommitment(utxo);
      const commitment = commitmentBigInt.toString(16).padStart(64, "0");

      // Use recipientWallet as recipientVkPub so operator can match invoice via
      // recipientWallet === loadedDraft.recipient (operator/page.tsx line ~423)
      const invariants: PayloadInvariants = {
        nullifier: randomBytes(32),
        commitment: hexToBytes(commitment),
        amount: lamports,
        tokenMint: mint,
        recipientVkPub: recipientPubkey.toBytes(),
        nonce: randomBytes(16),
      };
      updateStep("commitment", { status: "success" });

      setProofStep("prove");
      updateStep("proposal", { status: "running" });

      // Step 3: Build gatekeeper instruction + Squads proposal
      const hash = computePayloadHash(invariants);
      const { instruction } = await buildIssueLicenseIxBrowser({
        multisig: multisigAddress,
        payloadHash: hash,
        nonce: invariants.nonce,
      });
      const proposalResult = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: [fundOperatorIx, instruction],
        memo: memo.trim()
          ? `stealth invoice: ${memo.trim()}`
          : `stealth invoice ${stealthData.id.slice(0, 8)}`,
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
        token_mint: mint.toBase58(),
      };

      updateStep("persist", { status: "running" });
      // Step 4: Persist ProposalDraft (recipient = recipientWallet for operator lookup)
      const draftRes = await fetchWithAuth("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          transactionIndex,
          amount: lamports.toString(),
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
        }),
      });
      if (!draftRes.ok) {
        const body = (await draftRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not persist proposal draft.");
      }

      // Step 5: Cache claim secrets in sessionStorage (never sent to server)
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
      addToast(message, "success");
    } finally {
      setPending(false);
      setProofStep(null);
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
        <Link href="/" className="text-sm text-accent transition-colors hover:text-accent-hover">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

  // After success: show claim URL + link to proposal (don't auto-redirect, user must copy first)
  if (result) {
    const fullClaimUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${result.claimUrl}`;
    return (
      <WorkspacePage>
        <WorkspaceHeader
          eyebrow="STEALTH INVOICE"
          title="Invoice sealed"
          description="Share the claim link before continuing — the recipient needs it after the proposal is executed."
        />

        <div>
          <Panel>
            <PanelHeader
              icon={CheckCircle2}
              title={`Claim link ready · Proposal #${result.transactionIndex}`}
            />
            <PanelBody className="space-y-4">
              {claimQrDataUrl ? (
                <div className="flex justify-center">
                  <img
                    src={claimQrDataUrl}
                    alt="Claim link QR code"
                    className="h-[180px] w-[180px] rounded-md border border-border bg-white p-2"
                  />
                </div>
              ) : null}
              <div className="rounded-md border border-accent/20 bg-accent-soft px-3 py-2">
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
            </PanelBody>
          </Panel>
        </div>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="STEALTH INVOICE"
          title="Create claim link"
          description="Generate a private invoice and open a Squads proposal for signer approval."
        />

        <div>
          <Panel>
            <PanelHeader
              icon={BookOpen}
              title="New invoice"
              description="Set recipient, amount, and reference"
            />
            <PanelBody>
              <form onSubmit={handleSubmit} className="space-y-4">
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

                <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                  <div>
                    <Label htmlFor="amount">Amount (SOL)</Label>
                    <Input
                      id="amount"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.5"
                      className="mt-1.5 font-mono"
                    />
                  </div>

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
                </div>

                <ProofGenerationState currentStep={proofStep} complete={false} error={error} />

                <label className="flex items-start gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                  />
                  I confirm the recipient and amount are correct before creating this invoice.
                </label>

                {!pending && (
                  <Button
                    type="submit"
                    disabled={!confirmChecked || !amount || !recipientWallet || !wallet.publicKey}
                    className="w-full"
                  >
                    Create invoice + proposal
                  </Button>
                )}

                {!wallet.publicKey ? (
                  <p className="text-xs text-signal-warn">
                    Connect a multisig member wallet first.
                  </p>
                ) : null}

                {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
              </form>
            </PanelBody>
          </Panel>
        </div>

        <ConfirmModal
          open={showConfirm}
          title="Create invoice"
          description={`This creates a claim link and opens a proposal for ${amount} SOL.`}
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

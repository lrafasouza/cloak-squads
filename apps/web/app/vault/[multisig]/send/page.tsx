"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenLogo } from "@/components/ui/token-logo";
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
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { useSolPrice } from "@/lib/hooks/useSolPrice";
import { SOL_TOKEN, useVaultTokens } from "@/lib/hooks/useVaultTokens";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import { lamportsToSol } from "@/lib/sol";
import { createVaultProposal } from "@/lib/squads-sdk";
import { SOL_MINT, tokenAmountToUnits } from "@/lib/tokens";
import { proposalSummariesQueryKey } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { solAmountToLamports } from "@cloak-squads/core/amount";
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
import { ArrowLeft, Check, ChevronDown, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, use, useCallback, useEffect, useMemo, useRef, useState } from "react";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// ── Token Dropdown ─────────────────────────────────────────────────────────

interface TokenDropdownProps {
  tokens: ReturnType<typeof useVaultTokens>["data"];
  selectedMint: string;
  onSelect: (mint: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

function TokenDropdown({
  tokens = [],
  selectedMint,
  onSelect,
  disabled,
  loading,
}: TokenDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = tokens.find((t) => t.mint === selectedMint) ?? tokens[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && !loading && setOpen((v) => !v)}
        disabled={disabled || loading}
        className="flex h-11 min-w-[110px] items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {loading ? (
          <span className="h-5 w-5 animate-pulse rounded-full bg-surface-2" />
        ) : selected ? (
          <TokenLogo symbol={selected.symbol as "SOL" | "USDC"} size={20} />
        ) : null}
        <span>{loading ? "—" : (selected?.symbol ?? "SOL")}</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-xl border border-border bg-surface shadow-lg ring-1 ring-black/5">
          {loading ? (
            <div className="px-4 py-3 text-xs text-ink-muted">Loading tokens…</div>
          ) : tokens.length === 0 ? (
            <div className="px-4 py-3 text-xs text-ink-muted">No tokens found</div>
          ) : (
            tokens.map((t) => {
              const active = t.mint === selectedMint;
              return (
                <button
                  key={t.mint}
                  type="button"
                  onClick={() => {
                    onSelect(t.mint);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-2 ${active ? "text-accent" : "text-ink"}`}
                >
                  <TokenLogo symbol={t.symbol as "SOL" | "USDC"} size={18} />
                  <span className="flex-1 text-left font-medium">{t.symbol}</span>
                  <span className="font-mono text-xs text-ink-muted">{t.uiBalance}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SendPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [sendMode, setSendMode] = useState<"private" | "public">("private");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [selectedMint, setSelectedMint] = useState<string>(SOL_TOKEN.mint);
  const [recipientNeedsAta, setRecipientNeedsAta] = useState(false);

  const { data: tokens = [], isLoading: tokensLoading } = useVaultTokens(multisig);
  const { data: solPrice } = useSolPrice();

  const selectedToken = useMemo(
    () => tokens.find((t) => t.mint === selectedMint) ?? tokens[0],
    [tokens, selectedMint],
  );

  const isSol = selectedMint === SOL_MINT;

  const handleTokenSelect = useCallback((mint: string) => {
    setSelectedMint(mint);
    setAmount("");
  }, []);

  const amountStep = isSol ? "0.000000001" : "0.000001";
  const amountMin = isSol ? "0.000000001" : "0.000001";
  const amountPlaceholder = isSol ? "0.0" : "0.00";

  const usdPreview = useMemo(() => {
    const num = Number.parseFloat(amount);
    if (!num) return null;
    if (isSol) {
      if (!solPrice) return null;
      return `≈ ${(num * solPrice).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}`;
    }
    return `= ${num.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}`;
  }, [amount, solPrice, isSol]);

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

  const gatekeeperProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
    [],
  );

  // Check ATA need when recipient + token changes
  useEffect(() => {
    if (isSol || !recipient || !selectedToken) {
      setRecipientNeedsAta(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const recipientPk = new PublicKey(recipient);
        const mintPk = new PublicKey(selectedToken.mint);
        const ata = await getAssociatedTokenAddress(mintPk, recipientPk);
        const info = await connection.getAccountInfo(ata);
        if (!cancelled) setRecipientNeedsAta(!info);
      } catch {
        if (!cancelled) setRecipientNeedsAta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipient, selectedToken, isSol, connection]);

  // ── Private send (SOL + USDC via Cloak gatekeeper license) ──────────────
  async function handlePrivateSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const tokenLabel = selectedToken?.symbol ?? "SOL";
    startTransaction({
      title: `Creating private ${tokenLabel} send proposal`,
      description: "Preparing your private transfer and opening a vault proposal.",
      steps: [
        {
          id: "validate",
          title: "Validate transfer",
          description: `Checking wallet, recipient, ${tokenLabel} balance, operator, and vault readiness.`,
        },
        {
          id: "commitment",
          title: "Build private send",
          description: "Creating the shielded transfer details signers will approve.",
        },
        {
          id: "squads",
          title: "Create Squads proposal",
          description: "Preparing the private transfer and creating the vault proposal.",
        },
        {
          id: "persist",
          title: "Save transfer details",
          description: "Storing the private payment data securely for the operator.",
        },
      ],
    });

    try {
      if (!wallet.publicKey || !multisigAddress) {
        throw new Error("Connect a wallet and open a valid multisig.");
      }

      const recipientPubkey = new PublicKey(recipient);
      const [vaultPda] = multisigSdk.getVaultPda({ multisigPda: multisigAddress, index: 0 });

      // Derive amount in token-native units (lamports for SOL, micro-USDC for USDC)
      const decimals = selectedToken?.decimals ?? 9;
      const tokenUnits = isSol ? solAmountToLamports(amount) : tokenAmountToUnits(amount, decimals);

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
        if (!selectedToken) throw new Error("Select a token.");
        if (tokenUnits > selectedToken.balance) {
          throw new Error(
            `Insufficient ${tokenLabel}. Need ${amount}, vault has ${selectedToken.uiBalance}.`,
          );
        }
      }

      await assertCofreInitialized({ connection, multisig: multisigAddress, gatekeeperProgram });

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
        if (!selectedToken) throw new Error("Select a token.");
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
      updateStep("commitment", { status: "running" });

      // Build UTXO commitment — mint-aware
      if (!selectedToken) throw new Error("Select a token.");
      const cloakMint = isSol ? NATIVE_SOL_MINT : new PublicKey(selectedToken.mint);
      const keypair = await generateUtxoKeypair();
      const utxo = await createUtxo(tokenUnits, keypair, cloakMint);
      const commitmentBigInt = await computeUtxoCommitment(utxo);
      const commitmentHex = commitmentBigInt.toString(16).padStart(64, "0");

      const invariants: PayloadInvariants = {
        nullifier: randomBytes(32),
        commitment: hexToBytes(commitmentHex),
        amount: tokenUnits,
        tokenMint: cloakMint,
        recipientVkPub: recipientPubkey.toBytes(),
        nonce: randomBytes(16),
      };

      const payloadHash = computePayloadHash(invariants);
      updateStep("commitment", { status: "success" });
      updateStep("squads", { status: "running" });

      const { instruction: licenseIx } = await buildIssueLicenseIxBrowser({
        multisig: multisigAddress,
        payloadHash,
        nonce: invariants.nonce,
      });
      proposalInstructions.push(licenseIx);

      const result = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: proposalInstructions,
        memo: `private send ${tokenLabel}`,
      });

      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${result.transactionIndex.toString()} created on-chain.`,
      });
      updateStep("persist", { status: "running" });

      const transactionIndex = result.transactionIndex.toString();
      const commitmentClaim = {
        amount: tokenUnits.toString(),
        keypairPrivateKey: keypair.privateKey.toString(16).padStart(64, "0"),
        keypairPublicKey: keypair.publicKey.toString(16).padStart(64, "0"),
        blinding: utxo.blinding.toString(16).padStart(64, "0"),
        commitment: commitmentHex,
        recipient_vk: recipientPubkey.toBase58(),
        token_mint: cloakMint.toBase58(),
      };

      try {
        sessionStorage.setItem(
          `send-claim:${multisig}:${transactionIndex}`,
          JSON.stringify(commitmentClaim),
        );
      } catch {
        /* sessionStorage unavailable */
      }

      const draftResponse = await fetchWithAuth("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          transactionIndex,
          amount: tokenUnits.toString(),
          recipient: recipientPubkey.toBase58(),
          memo: memo || undefined,
          payloadHash: Array.from(payloadHash),
          invariants: {
            nullifier: Array.from(invariants.nullifier),
            commitment: Array.from(invariants.commitment),
            amount: tokenUnits.toString(),
            tokenMint: cloakMint.toBase58(),
            recipientVkPub: Array.from(invariants.recipientVkPub),
            nonce: Array.from(invariants.nonce),
          },
          commitmentClaim,
        }),
      });

      if (!draftResponse.ok) {
        const body = (await draftResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not persist proposal draft.");
      }

      updateStep("persist", { status: "success" });
      completeTransaction({
        title: `Private ${tokenLabel} proposal ready`,
        description: `Proposal #${transactionIndex} is ready for signer approval.`,
      });
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      router.push(`/vault/${multisig}/proposals/${transactionIndex}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not create proposal.";
      setError(message);
      failTransaction(message);
      setPending(false);
    }
  }

  // ── Public send (SOL + USDC, no Cloak license) ──────────────────────────
  async function handlePublicSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const tokenLabel = selectedToken?.symbol ?? "token";
    startTransaction({
      title: `Creating ${tokenLabel} transfer proposal`,
      description: "Opening a standard Squads vault transfer proposal.",
      steps: [
        {
          id: "validate",
          title: "Validate transfer",
          description: `Checking wallet, recipient, and ${tokenLabel} balance.`,
        },
        {
          id: "squads",
          title: "Create Squads proposal",
          description: "Your wallet signs the vault transaction.",
        },
      ],
    });

    try {
      if (!wallet.publicKey || !multisigAddress || !wallet.sendTransaction) {
        throw new Error("Connect a wallet and open a valid multisig.");
      }

      const recipientPubkey = new PublicKey(recipient);
      const [vaultPda] = multisigSdk.getVaultPda({ multisigPda: multisigAddress, index: 0 });
      const instructions = [];

      if (isSol) {
        const lamports = solAmountToLamports(amount);
        const vaultBalance = await connection.getBalance(vaultPda, "confirmed");
        if (BigInt(vaultBalance) < lamports) {
          const deficit = lamports - BigInt(vaultBalance);
          throw new Error(
            `Insufficient SOL. Need ${lamportsToSol(String(lamports))} SOL, vault has ${lamportsToSol(String(vaultBalance))} SOL. Short ${lamportsToSol(String(deficit))} SOL.`,
          );
        }
        instructions.push(
          SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: recipientPubkey, lamports }),
        );
      } else {
        if (!selectedToken) throw new Error("Select a token.");
        const mintPk = new PublicKey(selectedToken.mint);
        const units = tokenAmountToUnits(amount, selectedToken.decimals);
        if (units === 0n) throw new Error("Amount must be greater than 0.");
        if (units > selectedToken.balance) {
          throw new Error(
            `Insufficient ${tokenLabel}. Need ${amount}, vault has ${selectedToken.uiBalance}.`,
          );
        }
        const vaultAta = await getAssociatedTokenAddress(mintPk, vaultPda, true);
        const recipientAta = await getAssociatedTokenAddress(mintPk, recipientPubkey);
        const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
        if (!recipientAtaInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              vaultPda,
              recipientAta,
              recipientPubkey,
              mintPk,
            ),
          );
        }
        instructions.push(
          createTransferCheckedInstruction(
            vaultAta,
            mintPk,
            recipientAta,
            vaultPda,
            units,
            selectedToken.decimals,
          ),
        );
      }

      updateStep("validate", { status: "success" });
      updateStep("squads", { status: "running" });

      const result = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions,
        memo: memo || `Send ${amount} ${tokenLabel}`,
      });

      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${result.transactionIndex.toString()} created.`,
      });
      completeTransaction({
        title: `${tokenLabel} proposal ready`,
        description: `Proposal #${result.transactionIndex.toString()} is ready for signer approval.`,
      });
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      router.push(`/vault/${multisig}/proposals/${result.transactionIndex.toString()}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not create proposal.";
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

  const tokenLabel = selectedToken?.symbol ?? "SOL";
  const isPrivate = sendMode === "private";

  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="SEND"
          title={isPrivate ? `Send ${tokenLabel} privately` : `Send ${tokenLabel}`}
          description={
            isPrivate
              ? `Create a sealed ${tokenLabel} transfer through your Squads vault. The recipient address stays unlinkable on-chain.`
              : `Create a standard Squads vault ${tokenLabel} transfer. Visible to all signers on-chain.`
          }
        />

        <div>
          {/* Mode toggle */}
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            {(["private", "public"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setSendMode(mode);
                  if (mode === "private") setSelectedMint(SOL_MINT);
                }}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  sendMode === mode ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
                }`}
              >
                {mode === "private" ? "Private Send" : "Public Send"}
              </button>
            ))}
          </div>

          <Panel className="mt-4">
            <PanelHeader
              icon={Send}
              title="Transfer details"
              description={
                isPrivate
                  ? "Funds are routed through the shielded pool — the recipient address stays unlinkable on-chain."
                  : "Public send creates a standard Squads vault transfer visible to all signers on-chain."
              }
            />
            <PanelBody>
              <form
                onSubmit={isPrivate ? handlePrivateSend : handlePublicSend}
                className="space-y-5"
              >
                {/* Recipient */}
                <div>
                  <Label htmlFor="recipient">Recipient</Label>
                  <div className="mt-1.5">
                    <RecipientInput
                      id="recipient"
                      value={recipient}
                      onChange={setRecipient}
                      disabled={pending}
                      required
                    />
                  </div>
                </div>

                {/* Amount + Token selector */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="amount">Amount ({tokenLabel})</Label>
                    <span className="text-xs text-ink-muted">
                      Available:{" "}
                      <button
                        type="button"
                        className="font-mono text-accent hover:underline disabled:opacity-50"
                        onClick={handleMaxAmount}
                        disabled={pending || !selectedToken}
                      >
                        {selectedToken ? `${selectedToken.uiBalance} ${selectedToken.symbol}` : "—"}
                      </button>
                    </span>
                  </div>

                  <div className="mt-1.5 flex gap-2">
                    {isPrivate ? (
                      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-ink">
                        <TokenLogo symbol="SOL" size={16} />
                        SOL
                      </div>
                    ) : (
                      <TokenDropdown
                        tokens={tokens}
                        selectedMint={selectedMint}
                        onSelect={handleTokenSelect}
                        disabled={pending}
                        loading={tokensLoading}
                      />
                    )}
                    <Input
                      id="amount"
                      type="number"
                      step={amountStep}
                      min={amountMin}
                      placeholder={amountPlaceholder}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1"
                      required
                      disabled={pending}
                    />
                  </div>
                  {isPrivate && (
                    <p className="mt-1.5 text-xs text-ink-muted">
                      Private sends currently support SOL only. Use Public Send for token transfers.
                    </p>
                  )}

                  {usdPreview && <p className="mt-1.5 text-xs text-ink-muted">{usdPreview}</p>}
                </div>

                {/* Memo */}
                <div>
                  <Label htmlFor="memo">Memo (optional)</Label>
                  <Input
                    id="memo"
                    type="text"
                    placeholder="Internal reference"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="mt-1.5"
                    disabled={pending}
                  />
                </div>

                {/* Contextual alerts */}
                {error && <InlineAlert tone="danger">{error}</InlineAlert>}

                {!isPrivate && (
                  <InlineAlert tone="info">
                    Creates a standard Squads vault {tokenLabel} transfer. The recipient and amount
                    will be visible on-chain.
                  </InlineAlert>
                )}

                {recipientNeedsAta && !isSol && (
                  <InlineAlert tone="warning">
                    Recipient has no {tokenLabel} token account. The vault will pay ~0.002 SOL to
                    create one automatically.
                  </InlineAlert>
                )}

                {/* Confirm */}
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                  />
                  <span className="flex-1">
                    I confirm the recipient address and{" "}
                    <span className="font-mono font-medium text-ink">
                      {amount || "0"} {tokenLabel}
                    </span>{" "}
                    amount are correct before creating this proposal.
                  </span>
                </label>

                {/* Actions */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={`/vault/${multisig}`}
                    className="inline-flex w-full shrink-0 items-center justify-center rounded-md border border-border-strong bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2 sm:w-auto"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Link>
                  {!pending && (
                    <Button
                      type="submit"
                      disabled={!confirmChecked || !wallet.publicKey}
                      className="w-full sm:w-auto"
                    >
                      {isPrivate ? `Send ${tokenLabel} privately` : `Send ${tokenLabel}`}
                    </Button>
                  )}
                </div>

                {!wallet.publicKey && (
                  <p className="text-xs text-signal-warn">Connect a wallet to create a proposal.</p>
                )}
              </form>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </WorkspacePage>
  );
}

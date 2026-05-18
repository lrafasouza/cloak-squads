"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptRow } from "@/components/ui/receipt-row";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { TokenDropdown } from "@/components/vault/TokenDropdown";
import { publicEnv } from "@/lib/env";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { SOL_TOKEN, useVaultTokens } from "@/lib/hooks/useVaultTokens";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import { truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { createVaultProposal } from "@/lib/squads-sdk";
import { SOL_MINT, tokenAmountToUnits } from "@/lib/tokens";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
import {
  MIN_PRIVATE_DEPOSIT_LAMPORTS,
  MIN_PRIVATE_DEPOSIT_SOL,
  assertPrivateSolMinimum,
  solAmountToLamports,
} from "@cloak-squads/core/amount";
import { assertCofreInitialized } from "@cloak-squads/core/cofre-status";
import { computePayloadHash } from "@cloak-squads/core/hashing";
import { encryptMemo, serializeEncryptedMemo } from "@cloak-squads/core/memo-crypto";
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
import { Eye, Lock, Send } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import nacl from "tweetnacl";

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex: string) {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Wallets fall back to "mainnet" when their cluster probe hasn't completed
// before the first signTransaction. Detect that case so we can replace the
// raw wallet error with an actionable hint instead of leaving the user
// staring at "WalletSendTransactionError: ... mainnet ...".
function isWalletNetworkMismatch(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("mainnet") ||
    lower.includes("wrong network") ||
    lower.includes("network mismatch") ||
    lower.includes("different network")
  );
}

type SendMode = "private" | "public";

export function SendModal({
  multisig,
  open,
  onOpenChange,
  defaultRecipient = "",
  defaultAmount = "",
  defaultMode,
  defaultVaultIndex = 0,
  subVaultAccounts = [],
}: {
  multisig: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultRecipient?: string;
  defaultAmount?: string;
  defaultMode?: SendMode;
  defaultVaultIndex?: number;
  subVaultAccounts?: Array<{ vaultIndex: number; name: string }>;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const [recipient, setRecipient] = useState(defaultRecipient);
  const [amount, setAmount] = useState(defaultAmount);
  const [memo, setMemo] = useState("");
  const [mode, setMode] = useState<SendMode>(defaultMode ?? "private");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMint, setSelectedMint] = useState<string>(SOL_TOKEN.mint);
  const [selectedVaultIndex, setSelectedVaultIndex] = useState(defaultVaultIndex);
  const [destType, setDestType] = useState<"external" | "account">("external");
  const [destVaultIndex, setDestVaultIndex] = useState<number | null>(null);

  const allAccounts = useMemo(
    () => [{ vaultIndex: 0, name: "Primary" }, ...subVaultAccounts],
    [subVaultAccounts],
  );

  const multisigPk = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  // Derive destination address when sending to another internal account
  useEffect(() => {
    if (destType !== "account" || destVaultIndex === null || !multisigPk) return;
    const [pda] = multisigSdk.getVaultPda({ multisigPda: multisigPk, index: destVaultIndex });
    setRecipient(pda.toBase58());
  }, [destType, destVaultIndex, multisigPk]);

  // If source changes to match destination, clear destination
  useEffect(() => {
    if (destType === "account" && destVaultIndex === selectedVaultIndex) {
      setDestVaultIndex(null);
      setRecipient("");
    }
  }, [selectedVaultIndex, destType, destVaultIndex]);

  const { data: tokens = [], isLoading: tokensLoading } = useVaultTokens(
    multisig,
    selectedVaultIndex,
  );

  const selectedToken = useMemo(
    () => tokens.find((t) => t.mint === selectedMint) ?? tokens[0],
    [tokens, selectedMint],
  );

  const isSol = selectedMint === SOL_MINT;
  const tokenLabel = selectedToken?.symbol ?? "SOL";

  // Devnet Cloak shielded pool is only initialized for SOL. Force public mode
  // for any SPL token until additional shielded pools are deployed.
  useEffect(() => {
    if (!isSol && mode === "private") setMode("public");
  }, [isSol, mode]);

  // Force public mode when destination is an internal vault account.
  // Cloak relay can only deliver to Ed25519 wallets; vault PDAs are off-curve.
  useEffect(() => {
    if (destType === "account" && mode === "private") setMode("public");
  }, [destType, mode]);

  const amountStep = isSol ? "0.000000001" : "0.000001";
  const amountMin = mode === "private" && isSol ? "0.01" : isSol ? "0.000000001" : "0.000001";
  const amountPlaceholder = isSol ? "0.0" : "0.00";

  const belowPrivateMin = useMemo(() => {
    if (mode !== "private" || !isSol || !amount.trim()) return false;
    try {
      return solAmountToLamports(amount) < MIN_PRIVATE_DEPOSIT_LAMPORTS;
    } catch {
      return false;
    }
  }, [mode, isSol, amount]);

  useEffect(() => {
    if (open) {
      setRecipient(defaultRecipient);
      setAmount(defaultAmount);
      if (defaultMode) setMode(defaultMode);
      setSelectedVaultIndex(defaultVaultIndex);
      setDestType("external");
      setDestVaultIndex(null);
    }
  }, [open, defaultRecipient, defaultAmount, defaultMode, defaultVaultIndex]);

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

  const reset = () => {
    setRecipient("");
    setAmount("");
    setMemo("");
    setError(null);
    setMode("private");
    setSelectedMint(SOL_TOKEN.mint);
    setSelectedVaultIndex(defaultVaultIndex);
    setDestType("external");
    setDestVaultIndex(null);
  };

  const handleClose = (v: boolean) => {
    if (!pending) {
      onOpenChange(v);
      if (!v) reset();
    }
  };

  const handleMaxAmount = useCallback(() => {
    if (selectedToken) setAmount(selectedToken.uiBalance);
  }, [selectedToken]);

  const handleTokenSelect = useCallback((mint: string) => {
    setSelectedMint(mint);
    setAmount("");
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient.trim());
    } catch {
      setError("Invalid recipient address.");
      return;
    }

    if (!wallet.publicKey || !multisigAddress || !wallet.sendTransaction) {
      setError("Connect a wallet and open a valid multisig.");
      return;
    }

    // Private mode requires an Ed25519 wallet recipient. PDAs (off-curve)
    // would be silently accepted by the proposal flow but rejected by Cloak's
    // relay at delivery time, leaving funds stuck in the shielded pool.
    if (mode === "private" && !PublicKey.isOnCurve(recipientPubkey.toBuffer())) {
      setError(
        "Recipient is not an Ed25519 wallet (likely a PDA). Cloak can only deliver to standard wallets, so switch to Public mode or use a different recipient.",
      );
      return;
    }

    const decimals = selectedToken?.decimals ?? 9;
    let tokenUnits: bigint;
    try {
      tokenUnits = isSol ? solAmountToLamports(amount) : tokenAmountToUnits(amount, decimals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid amount.");
      return;
    }

    if (tokenUnits === 0n) {
      setError("Amount must be greater than 0.");
      return;
    }

    if (mode === "private" && isSol) {
      try {
        assertPrivateSolMinimum(tokenUnits);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Amount below Cloak minimum.");
        return;
      }
    }

    setPending(true);

    startTransaction({
      title: `Creating ${mode === "public" ? "public" : "private"} ${tokenLabel} send proposal`,
      description:
        mode === "public"
          ? "Opening a standard Squads vault transfer proposal."
          : "Preparing your private transfer and opening a vault proposal.",
      steps:
        mode === "public"
          ? [
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
            ]
          : [
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
                description: "Funding operator and creating the private send proposal.",
              },
              {
                id: "persist",
                title: "Save transfer details",
                description: "Storing the private payment data securely for the operator.",
              },
            ],
    });

    try {
      const [vaultPda] = multisigSdk.getVaultPda({
        multisigPda: multisigAddress,
        index: selectedVaultIndex,
      });

      // Balance check
      if (isSol) {
        const vaultBalance = await connection.getBalance(vaultPda, "confirmed");
        if (BigInt(vaultBalance) < tokenUnits) {
          const deficit = tokenUnits - BigInt(vaultBalance);
          const msg = `Insufficient vault balance. Need ${lamportsToSol(String(tokenUnits))} SOL, vault has ${lamportsToSol(String(vaultBalance))} SOL. Short ${lamportsToSol(String(deficit))} SOL.`;
          setError(msg);
          failTransaction(msg);
          setPending(false);
          return;
        }
      } else {
        if (!selectedToken) throw new Error("Select a token.");
        if (tokenUnits > selectedToken.balance) {
          throw new Error(
            `Insufficient ${tokenLabel}. Need ${amount}, vault has ${selectedToken.uiBalance}.`,
          );
        }
      }

      if (mode === "public") {
        updateStep("validate", { status: "success" });
        updateStep("squads", { status: "running" });

        const instructions = [];
        if (isSol) {
          instructions.push(
            SystemProgram.transfer({
              fromPubkey: vaultPda,
              toPubkey: recipientPubkey,
              lamports: tokenUnits,
            }),
          );
        } else {
          if (!selectedToken) throw new Error("Select a token.");
          const mintPk = new PublicKey(selectedToken.mint);
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
              tokenUnits,
              decimals,
            ),
          );
        }

        const result = await createVaultProposal({
          connection,
          wallet,
          multisigPda: multisigAddress,
          instructions,
          memo: memo.trim() || `Send ${amount} ${tokenLabel}`,
          vaultIndex: selectedVaultIndex,
        });

        updateStep("squads", {
          status: "success",
          signature: result.signature,
          description: `Proposal #${result.transactionIndex.toString()} created on-chain.`,
        });

        // Persist a public-kind draft so the proposal page can render the
        // amount, recipient, and memo instead of the generic fallback.
        // Non-fatal: the Squads proposal is the source of truth.
        const tokenMintForDraft = isSol ? SOL_MINT : selectedToken?.mint;
        void fetchWithAuth("/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cofreAddress: multisigAddress.toBase58(),
            transactionIndex: result.transactionIndex.toString(),
            kind: "public",
            amount: tokenUnits.toString(),
            recipient: recipientPubkey.toBase58(),
            memo: memo.trim() || undefined,
            tokenMint: tokenMintForDraft,
            vaultIndex: selectedVaultIndex,
          }),
        }).catch(() => {
          /* non-fatal */
        });

        completeTransaction({
          title: `${tokenLabel} proposal ready`,
          description: `Proposal #${result.transactionIndex.toString()} is ready for signer approval.`,
        });
        handleClose(false);
        return;
      }

      // Private mode
      await assertCofreInitialized({
        connection,
        multisig: multisigAddress,
        gatekeeperProgram,
      });

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
        vaultIndex: selectedVaultIndex,
      });
      proposalInstructions.push(licenseIx);

      const result = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: proposalInstructions,
        memo: memo.trim() || `private send ${tokenLabel}`,
        vaultIndex: selectedVaultIndex,
      });

      const transactionIndex = result.transactionIndex.toString();

      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${transactionIndex} created on-chain.`,
      });
      updateStep("persist", { status: "running" });

      // Encrypt memo for private sends. Store the box secret in commitmentClaim
      // so the operator can decrypt it — the ciphertext is safe to store in DB.
      let memoEncryptedFields: Record<string, unknown> = {};
      const trimmedMemo = memo.trim();
      let memoBoxSkHex: string | undefined;
      if (trimmedMemo) {
        const memoBoxKp = nacl.box.keyPair();
        memoBoxSkHex = Buffer.from(memoBoxKp.secretKey).toString("hex");
        const encrypted = encryptMemo(trimmedMemo, memoBoxKp.publicKey);
        const { memoCiphertext, memoNonce, memoEphemeralPk } = serializeEncryptedMemo(encrypted);
        memoEncryptedFields = {
          memoCiphertext: Array.from(Buffer.from(memoCiphertext, "hex")),
          memoNonce: Array.from(Buffer.from(memoNonce, "hex")),
          memoEphemeralPk: Array.from(Buffer.from(memoEphemeralPk, "hex")),
        };
      }

      const commitmentClaim = {
        amount: tokenUnits.toString(),
        keypairPrivateKey: keypair.privateKey.toString(16).padStart(64, "0"),
        keypairPublicKey: keypair.publicKey.toString(16).padStart(64, "0"),
        blinding: utxo.blinding.toString(16).padStart(64, "0"),
        commitment: commitmentHex,
        recipient_vk: recipientPubkey.toBase58(),
        token_mint: cloakMint.toBase58(),
        ...(memoBoxSkHex ? { memoBoxSk: memoBoxSkHex } : {}),
      };

      // F-402 (audit Pass 4): `commitmentClaim` here carries
      // `keypairPrivateKey` + `blinding`. Operator path refetches from
      // /api/proposals/[multisig]/[index] (includeSensitive=true).

      const draftResponse = await fetchWithAuth("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          transactionIndex,
          amount: tokenUnits.toString(),
          recipient: recipientPubkey.toBase58(),
          // memo left null for private sends — ciphertext stored below
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
          vaultIndex: selectedVaultIndex,
          ...memoEncryptedFields,
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
      handleClose(false);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Transaction failed.";
      const message = isWalletNetworkMismatch(raw)
        ? "Your wallet hasn't detected the network yet. Refresh the page and try again, or switch your wallet to devnet manually."
        : raw;
      setError(message);
      failTransaction(message);
    } finally {
      setPending(false);
    }
  };

  // Resolve a friendly destination label for the receipt block. Internal
  // accounts show by name; external addresses show as truncated mono.
  const resolvedDestLabel =
    destType === "account" && destVaultIndex !== null
      ? (allAccounts.find((a) => a.vaultIndex === destVaultIndex)?.name ?? "—")
      : recipient.trim()
        ? truncateAddress(recipient.trim())
        : null;

  const isReadyForReceipt = Boolean(amount) && Boolean(recipient.trim()) && !belowPrivateMin;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg" watermark watermarkSize={260} watermarkOpacity={0.04}>
        <DialogHeader>
          <p className="text-eyebrow">{mode === "private" ? "Send · Shielded" : "Send · Public"}</p>
          <DialogTitle className="mt-0.5">
            {mode === "private" ? `${tokenLabel} via Cloak` : `${tokenLabel} transfer`}
          </DialogTitle>
          <DialogDescription>
            {mode === "private"
              ? "Funds route through the Cloak shielded pool. The recipient address stays unlinkable on-chain."
              : "Creates a standard vault transfer that lands on-chain in the open. Requires member approval."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 pb-6 pt-5">
          {/* ── Mode toggle — public ↔ shielded — the moat surface ── */}
          <div>
            <p className="text-eyebrow mb-2">Privacy</p>
            <div role="radiogroup" aria-label="Privacy mode" className="grid grid-cols-2 gap-1.5">
              {(["private", "public"] as const).map((m) => {
                const privateDisabledForToken = m === "private" && !isSol;
                const privateDisabledForDest = m === "private" && destType === "account";
                const privateDisabled = privateDisabledForToken || privateDisabledForDest;
                const reason = privateDisabledForDest
                  ? "Vault accounts are off-curve PDAs, so Cloak can't deliver to them. Use Public mode for vault-to-vault transfers."
                  : privateDisabledForToken
                    ? "Private transfers are only available for SOL on devnet."
                    : undefined;
                const active = mode === m;
                const isPrivate = m === "private";
                const Icon = isPrivate ? Lock : Eye;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => !pending && !privateDisabled && setMode(m)}
                    disabled={pending || privateDisabled}
                    title={reason}
                    className={cn(
                      "group/mode relative flex flex-col items-start gap-1 rounded-list border px-3 py-2.5 text-left transition-aegis",
                      "disabled:cursor-not-allowed disabled:opacity-40",
                      active && isPrivate
                        ? "border-accent/50 bg-accent-soft text-accent shadow-raise-1"
                        : active
                          ? "border-border-strong bg-surface-2 text-ink shadow-raise-1"
                          : "border-border bg-surface text-ink-muted hover:border-border-strong hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span className="text-sm font-semibold">
                        {isPrivate ? "Shielded" : "Public"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-[11px] leading-tight",
                        active && isPrivate ? "text-accent/80" : "text-ink-subtle",
                      )}
                    >
                      {isPrivate ? "Unlinkable via Cloak" : "Visible on-chain"}
                    </span>
                  </button>
                );
              })}
            </div>
            {!isSol && (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">
                Private transfers are only available for SOL on devnet (the SPL shielded pool isn't
                initialized yet). {tokenLabel} sends fall back to public mode.
              </p>
            )}
            {isSol && destType === "account" && (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">
                Vault-to-vault transfers go through public mode. Private mode requires an Ed25519
                wallet recipient — vault PDAs are off-curve.
              </p>
            )}
          </div>

          {/* ── From account — only shown when sub-vaults exist ── */}
          {subVaultAccounts.length > 0 && (
            <div>
              <p className="text-eyebrow mb-2">From account</p>
              <div className="flex flex-wrap gap-1.5">
                {allAccounts.map((acct) => {
                  const active = selectedVaultIndex === acct.vaultIndex;
                  return (
                    <button
                      key={acct.vaultIndex}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setSelectedVaultIndex(acct.vaultIndex);
                        setAmount("");
                      }}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-xs font-medium transition-aegis",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                        active
                          ? "border-accent/40 bg-accent-soft text-accent"
                          : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
                      )}
                    >
                      {acct.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Recipient ── */}
          <div className="flex flex-col gap-2">
            <p className="text-eyebrow">Recipient</p>

            {subVaultAccounts.length > 0 && (
              <div
                role="radiogroup"
                aria-label="Destination type"
                className="inline-flex w-fit items-center rounded-md border border-border bg-surface-2 p-0.5"
              >
                {(["external", "account"] as const).map((t) => {
                  const active = destType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        if (pending) return;
                        setDestType(t);
                        if (t === "external") {
                          setRecipient("");
                          setDestVaultIndex(null);
                        } else {
                          const firstOther = allAccounts.find(
                            (a) => a.vaultIndex !== selectedVaultIndex,
                          );
                          if (firstOther) setDestVaultIndex(firstOther.vaultIndex);
                        }
                      }}
                      disabled={pending}
                      className={cn(
                        "inline-flex h-6 items-center rounded-[5px] px-2.5 text-[11px] font-semibold transition-aegis disabled:opacity-50",
                        active
                          ? "bg-accent text-accent-ink shadow-raise-1"
                          : "text-ink-subtle hover:text-ink",
                      )}
                    >
                      {t === "external" ? "External address" : "Another account"}
                    </button>
                  );
                })}
              </div>
            )}

            {destType === "external" ? (
              <Input
                id="sm-recipient"
                placeholder="Solana address"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="font-mono text-sm tabular-nums"
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allAccounts
                  .filter((a) => a.vaultIndex !== selectedVaultIndex)
                  .map((acct) => {
                    const active = destVaultIndex === acct.vaultIndex;
                    return (
                      <button
                        key={acct.vaultIndex}
                        type="button"
                        disabled={pending}
                        onClick={() => setDestVaultIndex(acct.vaultIndex)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-xs font-medium transition-aegis disabled:opacity-50",
                          active
                            ? "border-accent/40 bg-accent-soft text-accent"
                            : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
                        )}
                      >
                        To {acct.name}
                      </button>
                    );
                  })}
                {allAccounts.filter((a) => a.vaultIndex !== selectedVaultIndex).length === 0 && (
                  <p className="text-xs text-ink-subtle">No other accounts to send to.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Amount card — Fraunces big-input ledger ── */}
          <div className="rounded-list border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-eyebrow">You send</span>
              <button
                type="button"
                className="font-mono text-[11px] tabular-nums text-ink-muted transition-aegis hover:text-accent disabled:opacity-50"
                onClick={handleMaxAmount}
                disabled={pending || !selectedToken}
                title="Use full balance"
              >
                {selectedToken ? `${selectedToken.uiBalance} ${selectedToken.symbol} · MAX` : "—"}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Input
                id="sm-amount"
                type="number"
                step={amountStep}
                min={amountMin}
                placeholder={amountPlaceholder}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                aria-invalid={belowPrivateMin || undefined}
                className="flex-1 border-0 bg-transparent p-0 font-display text-3xl font-semibold tabular-nums tracking-tight placeholder:text-ink-subtle/30 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <TokenDropdown
                tokens={tokens}
                selectedMint={selectedMint}
                onSelect={handleTokenSelect}
                disabled={pending}
                loading={tokensLoading}
              />
            </div>
            {belowPrivateMin && (
              <p className="mt-2 text-[11px] leading-relaxed text-signal-danger">
                Increase to at least {MIN_PRIVATE_DEPOSIT_SOL} SOL — Cloak rejects smaller private
                deposits.
              </p>
            )}
          </div>

          {/* ── Memo ── */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sm-memo" className="text-eyebrow">
              Memo · optional
            </Label>
            <Input
              id="sm-memo"
              placeholder="Internal reference"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={pending}
            />
          </div>

          {/* ── Receipt summary — only when ready, draws final attention
              to what the operator is about to authorize ── */}
          {isReadyForReceipt && (
            <div className="rounded-list border border-border/60 bg-bg/40 px-4 py-3">
              <ReceiptRow label="Amount">
                {amount} {tokenLabel}
              </ReceiptRow>
              <ReceiptRow label="To" mono={mode === "public" || destType === "external"}>
                {resolvedDestLabel ?? "—"}
              </ReceiptRow>
              {memo.trim() && (
                <ReceiptRow label="Memo" mono={false} tone="muted">
                  {memo.trim()}
                </ReceiptRow>
              )}
              <ReceiptRow
                label="Privacy"
                tone={mode === "private" ? "accent" : "muted"}
                mono={false}
              >
                {mode === "private" ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" strokeWidth={2.25} />
                    Shielded via Cloak
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-2.5 w-2.5" strokeWidth={2.25} />
                    Public on-chain
                  </span>
                )}
              </ReceiptRow>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-signal-danger/30 bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
              {error}
            </p>
          )}

          <DialogFooter className="p-0 pt-0">
            <Button
              type="submit"
              disabled={
                pending || !recipient.trim() || !amount || !wallet.publicKey || belowPrivateMin
              }
              className="w-full gap-2"
            >
              {mode === "private" ? (
                <Lock className="h-4 w-4" strokeWidth={2.25} />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {pending
                ? "Creating proposal…"
                : amount
                  ? `Send ${amount} ${tokenLabel} · ${mode === "private" ? "Shielded" : "Public"}`
                  : mode === "private"
                    ? `Send ${tokenLabel} privately`
                    : `Send ${tokenLabel}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

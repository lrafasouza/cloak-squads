"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { TokenDropdown } from "@/components/vault/TokenDropdown";
import { useVaultTokens } from "@/lib/hooks/useVaultTokens";
import { PROPOSAL_RENT_THRESHOLD_SOL, useWalletSolBalance } from "@/lib/hooks/useWalletSolBalance";
import {
  SWAP_PROVIDER,
  type RaydiumQuote,
  formatSwapPreview,
  getRaydiumQuote,
  getRaydiumSwapInstructions,
  isDevnet,
} from "@/lib/raydium-swap";
import { createVaultProposal } from "@/lib/squads-sdk";
import { SOL_MINT, USDC_DECIMALS, USDC_MINT, tokenAmountToUnits } from "@/lib/tokens";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { ArrowLeftRight, Info, Loader2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const SLIPPAGE_OPTIONS = [
  { label: "0.1%", value: 10 },
  { label: "0.5%", value: 50 },
  { label: "1%", value: 100 },
];

const AVAILABLE_TOKENS = [
  { symbol: "SOL", mint: SOL_MINT, decimals: 9 },
  { symbol: "USDC", mint: USDC_MINT, decimals: USDC_DECIMALS },
];

function getTokenDecimals(mint: string): number {
  return AVAILABLE_TOKENS.find((t) => t.mint === mint)?.decimals ?? 6;
}

interface SwapPanelProps {
  multisig: string;
}

export function SwapPanel({ multisig }: SwapPanelProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
  const { data: tokens = [], isLoading: tokensLoading } = useVaultTokens(multisig);
  const { sol: walletSol, insufficientForProposal } = useWalletSolBalance();

  const [amount, setAmount] = useState("");
  const [inputMint, setInputMint] = useState(SOL_MINT);
  const [outputMint, setOutputMint] = useState(USDC_MINT);
  const [slippageBps, setSlippageBps] = useState(50);
  const [quote, setQuote] = useState<RaydiumQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedInputToken = useMemo(() => {
    const vaultToken = tokens.find((t) => t.mint === inputMint);
    const staticToken = AVAILABLE_TOKENS.find((t) => t.mint === inputMint);
    return (
      vaultToken ??
      (staticToken ? { ...staticToken, balance: 0n, uiBalance: "0", ataAddress: null } : undefined)
    );
  }, [tokens, inputMint]);

  const selectedOutputToken = useMemo(
    () => AVAILABLE_TOKENS.find((t) => t.mint === outputMint),
    [outputMint],
  );

  const inputDecimals = selectedInputToken?.decimals ?? 9;
  const isInputSol = inputMint === SOL_MINT;

  const amountStep = isInputSol ? "0.000000001" : "0.000001";
  const amountMin = isInputSol ? "0.000000001" : "0.000001";
  const amountPlaceholder = isInputSol ? "0.0" : "0.00";

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const reset = useCallback(() => {
    setAmount("");
    setInputMint(SOL_MINT);
    setOutputMint(USDC_MINT);
    setQuote(null);
    setQuoteError(null);
    setError(null);
    setSlippageBps(50);
  }, []);

  const handleMaxAmount = useCallback(() => {
    const token = tokens.find((t) => t.mint === inputMint);
    if (token) setAmount(token.uiBalance);
  }, [tokens, inputMint]);

  const handleInputSelect = useCallback((mint: string) => {
    setInputMint(mint);
    setAmount("");
    const other = AVAILABLE_TOKENS.find((t) => t.mint !== mint);
    if (other) setOutputMint(other.mint);
  }, []);

  const handleOutputSelect = useCallback((mint: string) => {
    setOutputMint(mint);
    setAmount("");
    const other = AVAILABLE_TOKENS.find((t) => t.mint !== mint);
    if (other) setInputMint(other.mint);
  }, []);

  useEffect(() => {
    if (!amount || amount === "" || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    const timeout = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const units = tokenAmountToUnits(amount, inputDecimals);
        const q = await getRaydiumQuote({
          inputMint,
          outputMint,
          amount: units.toString(),
          slippageBps,
        });
        if (mountedRef.current && currentRequestId === requestIdRef.current) {
          setQuote(q);
        }
      } catch (err) {
        if (mountedRef.current && currentRequestId === requestIdRef.current) {
          const msg = err instanceof Error ? err.message : "Failed to get quote";
          setQuoteError(msg);
          setQuote(null);
        }
      } finally {
        if (mountedRef.current && currentRequestId === requestIdRef.current) {
          setQuoteLoading(false);
        }
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [amount, inputMint, outputMint, slippageBps, inputDecimals]);

  const preview = useMemo(() => {
    if (!quote) return null;
    return formatSwapPreview(quote, getTokenDecimals(outputMint));
  }, [quote, outputMint]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!wallet.publicKey || !multisigAddress || !wallet.sendTransaction) {
      setError("Connect a wallet and open a valid multisig.");
      return;
    }

    if (!quote) {
      setError("No quote available. Please enter an amount.");
      return;
    }

    let units: bigint;
    try {
      units = tokenAmountToUnits(amount, inputDecimals);
    } catch {
      setError("Invalid amount.");
      return;
    }
    if (units === 0n) {
      setError("Amount must be greater than 0.");
      return;
    }

    if (quote.inputAmount !== units.toString()) {
      setError("Quote does not match current amount. Please wait for a fresh quote.");
      return;
    }

    const inputBalance = tokens.find((t) => t.mint === inputMint)?.balance ?? 0n;
    if (units > inputBalance) {
      const vaultBalance = tokens.find((t) => t.mint === inputMint)?.uiBalance ?? "0";
      const msg = `Insufficient vault balance. Need ${amount} ${selectedInputToken?.symbol}, vault has ${vaultBalance} ${selectedInputToken?.symbol}.`;
      setError(msg);
      return;
    }

    setPending(true);
    startTransaction({
      title: `Creating ${selectedInputToken?.symbol} → ${selectedOutputToken?.symbol} swap proposal`,
      description: `Building swap instructions via ${SWAP_PROVIDER} and creating a Squads vault proposal.`,
      steps: [
        {
          id: "quote",
          title: `Confirm ${SWAP_PROVIDER} quote`,
          description: "Finalizing the swap route.",
        },
        {
          id: "build",
          title: "Build swap instructions",
          description: "Preparing swap transaction for vault execution.",
        },
        {
          id: "squads",
          title: "Create Squads proposal",
          description: "Your wallet signs the vault transaction proposal.",
        },
      ],
    });

    try {
      updateStep("quote", { status: "success" });
      updateStep("build", { status: "running" });

      const [vaultPda] = (await import("@sqds/multisig")).getVaultPda({
        multisigPda: multisigAddress,
        index: 0,
      });
      const swapInstructions = await getRaydiumSwapInstructions(quote, vaultPda.toBase58());

      updateStep("build", { status: "success" });
      updateStep("squads", { status: "running" });

      const result = await createVaultProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: swapInstructions,
        memo: `Swap ${amount} ${selectedInputToken?.symbol} → ${selectedOutputToken?.symbol}`,
      });

      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${result.transactionIndex.toString()} created on-chain.`,
      });

      // Persist swap draft so the proposal page can identify this as a swap
      void fetchWithAuth("/api/swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cofreAddress: multisigAddress.toBase58(),
          transactionIndex: result.transactionIndex.toString(),
          inputMint,
          outputMint,
          inputAmount: units.toString(),
          outputAmount: quote.outputAmount,
          inputSymbol: selectedInputToken?.symbol ?? inputMint.slice(0, 6),
          outputSymbol: selectedOutputToken?.symbol ?? outputMint.slice(0, 6),
          memo: `Swap ${amount} ${selectedInputToken?.symbol} → ${selectedOutputToken?.symbol}`,
        }),
      }).catch(() => {/* non-fatal */});

      completeTransaction({
        title: "Swap proposal ready",
        description: `Proposal #${result.transactionIndex.toString()} is ready for signer approval.`,
      });
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Swap proposal failed.";
      setError(message);
      failTransaction(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {isDevnet() && (
        <p className="text-xs text-muted-foreground/60">
          Devnet · Orca SOL/USDC pool ·{" "}
          <span className="underline underline-offset-2">faucet.circle.com</span>
        </p>
      )}
      {/* From Card */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-ink-muted">From</span>
          <span className="text-xs text-ink-muted">
            Balance:{" "}
            <button
              type="button"
              className="ml-1 font-mono text-accent hover:underline disabled:opacity-50"
              onClick={handleMaxAmount}
              disabled={pending || !selectedInputToken}
            >
              {selectedInputToken
                ? `${selectedInputToken.uiBalance} ${selectedInputToken.symbol}`
                : "—"}
            </button>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Input
            id="swap-amount"
            type="number"
            step={amountStep}
            min={amountMin}
            placeholder={amountPlaceholder}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={pending}
            className="flex-1 border-0 bg-transparent p-0 text-xl font-medium placeholder:text-ink-muted/40 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-2xl"
          />
          <TokenDropdown
            tokens={tokens}
            selectedMint={inputMint}
            onSelect={handleInputSelect}
            disabled={pending}
            loading={tokensLoading}
          />
        </div>
      </div>

      {/* Swap Direction Button */}
      <div className="relative -my-3 flex justify-center">
        <button
          type="button"
          onClick={() => {
            setInputMint(outputMint);
            setOutputMint(inputMint);
            setAmount("");
          }}
          disabled={pending}
          className="z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2 shadow-sm transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
          title="Swap direction"
        >
          <ArrowLeftRight className="h-4 w-4 text-ink-muted" />
        </button>
      </div>

      {/* To Card */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-ink-muted">To (estimated)</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 text-xl font-medium text-ink sm:text-2xl">
            {preview ? preview.outAmountUi : "0.00"}
          </div>
          <TokenDropdown
            tokens={tokens}
            selectedMint={outputMint}
            onSelect={handleOutputSelect}
            disabled={pending}
            loading={tokensLoading}
          />
        </div>
      </div>

      {/* Slippage */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">Slippage</span>
        <div className="inline-flex gap-1">
          {SLIPPAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => !pending && setSlippageBps(opt.value)}
              disabled={pending}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                slippageBps === opt.value
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quote Details */}
      {quoteLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
          <span className="text-sm text-ink-muted">Fetching quote from {SWAP_PROVIDER}...</span>
        </div>
      )}

      {quoteError && (
        <p className="rounded-md bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
          {quoteError}
        </p>
      )}

      {preview && !quoteLoading && (
        <div className="space-y-1 rounded-lg border border-border bg-surface-2 px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-subtle">Rate</span>
            <span className="text-ink-muted">
              1 {selectedInputToken?.symbol} ≈{" "}
              {amount && Number(amount) > 0
                ? (Number(preview.outAmountUi.replace(/,/g, "")) / Number(amount)).toFixed(6)
                : "—"}{" "}
              {selectedOutputToken?.symbol}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-subtle">Route</span>
            <span className="text-ink-muted">{preview.routeLabel}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-subtle">Price Impact</span>
            <span
              className={Number(preview.priceImpact) > 1 ? "text-signal-danger" : "text-ink-muted"}
            >
              {preview.priceImpact}%
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
          {error}
        </p>
      )}

      {wallet.publicKey && insufficientForProposal && (
        <div className="flex items-start gap-2 rounded-lg border border-signal-danger/30 bg-signal-danger/10 px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-danger" />
          <p className="text-xs leading-relaxed text-signal-danger">
            Your connected wallet has only{" "}
            <span className="font-mono font-medium">{(walletSol ?? 0).toFixed(6)} SOL</span>.
            Creating a proposal needs at least{" "}
            <span className="font-mono font-medium">{PROPOSAL_RENT_THRESHOLD_SOL} SOL</span> to
            cover account rent + fees. Top up your wallet and try again.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
        <p className="text-xs leading-relaxed text-ink-muted">
          This creates a <span className="font-medium text-ink">multisig swap proposal</span>. Once
          enough members approve, any member can execute and the swap will be performed by the
          vault.
        </p>
      </div>

      <Button
        type="submit"
        disabled={pending || !amount || !quote || !wallet.publicKey || insufficientForProposal}
        className="w-full gap-2"
      >
        <ArrowLeftRight className="h-4 w-4" />
        {pending ? "Creating proposal..." : "Create Swap Proposal"}
      </Button>
    </form>
  );
}

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
import { ReceiptRow } from "@/components/ui/receipt-row";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import { TokenDropdown } from "@/components/vault/TokenDropdown";
import { useVaultTokens } from "@/lib/hooks/useVaultTokens";
import { PROPOSAL_RENT_THRESHOLD_SOL, useWalletSolBalance } from "@/lib/hooks/useWalletSolBalance";
import {
  type RaydiumQuote,
  SWAP_PROVIDER,
  formatSwapPreview,
  getRaydiumQuote,
  getRaydiumSwapInstructions,
  isDevnet,
} from "@/lib/raydium-swap";
import { createVaultProposal } from "@/lib/squads-sdk";
import { SOL_MINT, USDC_DECIMALS, USDC_MINT, tokenAmountToUnits } from "@/lib/tokens";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cn } from "@/lib/utils";
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

export function SwapModal({
  multisig,
  open,
  onOpenChange,
  subVaultAccounts = [],
}: {
  multisig: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subVaultAccounts?: Array<{ vaultIndex: number; name: string }>;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();

  const [selectedVaultIndex, setSelectedVaultIndex] = useState(0);
  const allAccounts = useMemo(
    () => [{ vaultIndex: 0, name: "Primary" }, ...subVaultAccounts],
    [subVaultAccounts],
  );

  const { data: tokens = [], isLoading: tokensLoading } = useVaultTokens(
    multisig,
    selectedVaultIndex,
  );
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
    setSelectedVaultIndex(0);
  }, []);

  const handleClose = useCallback(
    (v: boolean) => {
      if (!pending) {
        onOpenChange(v);
        if (!v) reset();
      }
    },
    [pending, onOpenChange, reset],
  );

  const handleMaxAmount = useCallback(() => {
    const token = tokens.find((t) => t.mint === inputMint);
    if (token) setAmount(token.uiBalance);
  }, [tokens, inputMint]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

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

  // Fetch quote when amount, tokens, or slippage changes
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
    }, 400); // Debounce

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
        index: selectedVaultIndex,
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
        vaultIndex: selectedVaultIndex,
      });

      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${result.transactionIndex.toString()} created on-chain.`,
      });

      // Persist swap draft so the proposal page can identify this as a swap.
      // Non-fatal: the on-chain proposal is the source of truth; if persistence
      // fails the proposal still works, it just renders with the generic title.
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
          vaultIndex: selectedVaultIndex,
        }),
      }).catch(() => {
        /* non-fatal */
      });

      completeTransaction({
        title: "Swap proposal ready",
        description: `Proposal #${result.transactionIndex.toString()} is ready for signer approval.`,
      });
      handleClose(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Swap proposal failed.";
      setError(message);
      failTransaction(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg" watermark watermarkSize={260} watermarkOpacity={0.04}>
        <DialogHeader>
          <p className="text-eyebrow">Swap · Multisig proposal</p>
          <DialogTitle className="mt-0.5">
            {selectedInputToken?.symbol} → {selectedOutputToken?.symbol}
          </DialogTitle>
          <DialogDescription>
            Routed via {SWAP_PROVIDER}. Creates a vault proposal that members must approve before
            execution.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 pb-6 pt-5">
          {isDevnet() && (
            <p className="text-[11px] uppercase tracking-eyebrow text-ink-subtle/70">
              Devnet · Orca SOL/USDC pool ·{" "}
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono normal-case tracking-normal text-accent hover:underline"
              >
                faucet.circle.com
              </a>
            </p>
          )}

          {/* From account — only shown when sub-vaults exist. Same pill
              vocabulary as ReceiveModal so the modal family reads as one. */}
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
                        "rounded-md border px-3 py-1.5 text-xs font-medium transition-aegis disabled:opacity-50",
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

          {/* ── From Card ── */}
          <div className="rounded-list border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-eyebrow">You pay</span>
              <button
                type="button"
                className="font-mono text-[11px] tabular-nums text-ink-muted transition-aegis hover:text-accent disabled:opacity-50"
                onClick={handleMaxAmount}
                disabled={pending || !selectedInputToken}
                title="Use full balance"
              >
                {selectedInputToken
                  ? `${selectedInputToken.uiBalance} ${selectedInputToken.symbol} · MAX`
                  : "—"}
              </button>
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
                className="flex-1 border-0 bg-transparent p-0 font-display text-3xl font-semibold tabular-nums tracking-tight placeholder:text-ink-subtle/30 focus-visible:ring-0 focus-visible:ring-offset-0"
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

          {/* ── Direction button — brass ring, sits between cards ── */}
          <div className="relative -my-5 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setInputMint(outputMint);
                setOutputMint(inputMint);
                setAmount("");
              }}
              disabled={pending}
              className={cn(
                "z-10 flex h-9 w-9 items-center justify-center rounded-full border bg-surface text-ink-muted shadow-raise-1 transition-aegis",
                "border-border-strong hover:rotate-180 hover:border-accent/50 hover:bg-surface-2 hover:text-accent",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              title="Reverse direction"
              aria-label="Reverse swap direction"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* ── To Card ── */}
          <div className="rounded-list border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-eyebrow">You receive · estimated</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
                {preview ? preview.outAmountUi : <span className="text-ink-subtle/40">0.00</span>}
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

          {/* ── Slippage ── */}
          <div className="flex items-center justify-between">
            <span className="text-eyebrow">Slippage</span>
            <div
              role="radiogroup"
              aria-label="Slippage tolerance"
              className="inline-flex items-center rounded-md border border-border bg-surface-2 p-0.5"
            >
              {SLIPPAGE_OPTIONS.map((opt) => {
                const active = slippageBps === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => !pending && setSlippageBps(opt.value)}
                    disabled={pending}
                    className={cn(
                      "inline-flex h-6 items-center rounded-[5px] px-2.5 text-[11px] font-semibold tabular-nums transition-aegis disabled:opacity-50",
                      active
                        ? "bg-accent text-accent-ink shadow-raise-1"
                        : "text-ink-subtle hover:text-ink",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Quote Details — receipt-style ledger ── */}
          {quoteLoading && (
            <div className="flex items-center gap-2 rounded-list border border-border bg-surface-2 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-ink-subtle" />
              <span className="text-sm text-ink-muted">Fetching quote from {SWAP_PROVIDER}…</span>
            </div>
          )}

          {quoteError && (
            <p className="rounded-md border border-signal-danger/30 bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
              {quoteError}
            </p>
          )}

          {preview && !quoteLoading && (
            <div className="rounded-list border border-border/60 bg-bg/40 px-4 py-3">
              <ReceiptRow label="Rate">
                1 {selectedInputToken?.symbol} ≈{" "}
                {amount && Number(amount) > 0
                  ? (Number(preview.outAmountUi.replace(/,/g, "")) / Number(amount)).toFixed(6)
                  : "—"}{" "}
                {selectedOutputToken?.symbol}
              </ReceiptRow>
              <ReceiptRow label="Route" mono={false} tone="muted">
                {preview.routeLabel}
              </ReceiptRow>
              <ReceiptRow
                label="Price impact"
                tone={Number(preview.priceImpact) > 1 ? "danger" : "muted"}
              >
                {preview.priceImpact}%
              </ReceiptRow>
              <ReceiptRow label="Provider" mono={false} tone="muted">
                {SWAP_PROVIDER}
              </ReceiptRow>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-signal-danger/30 bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
              {error}
            </p>
          )}

          {wallet.publicKey && insufficientForProposal && (
            <div className="flex items-start gap-2 rounded-list border border-signal-danger/30 bg-signal-danger/10 px-3 py-2.5">
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

          <DialogFooter className="p-0 pt-0">
            <Button
              type="submit"
              disabled={
                pending || !amount || !quote || !wallet.publicKey || insufficientForProposal
              }
              className="w-full gap-2"
            >
              <ArrowLeftRight className="h-4 w-4" />
              {pending
                ? "Creating proposal…"
                : amount && selectedInputToken && selectedOutputToken
                  ? `Swap ${amount} ${selectedInputToken.symbol} → ${selectedOutputToken.symbol}`
                  : "Create swap proposal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

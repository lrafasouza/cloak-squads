# Swap SOL → USDC via Jupiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Jupiter-powered SOL→USDC swap card to the vault QuickActionBar, creating Squads proposals for swap execution.

**Architecture:** A new `JupiterSwapService` calls Jupiter v6 API (`/quote` + `/swap-instruction`) to get swap instructions as JSON. The `SwapModal` component presents a swap UI (input SOL, preview USDC, slippage selector) and creates a Squads vault proposal with the swap instructions. The `QuickActionBar` adds a new "Swap" action button.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, shadcn/ui, Jupiter API v6, Squads SDK v4, Solana web3.js

---

## File Structure

### New Files
- `apps/web/lib/jupiter-swap.ts` — Service for Jupiter API integration (quote + swap-instruction)
- `apps/web/components/vault/SwapModal.tsx` — Swap modal component (UI + proposal creation)

### Modified Files
- `apps/web/components/vault/QuickActionBar.tsx` — Add "Swap" action to the grid

---

## Task 1: JupiterSwapService

**Files:**
- Create: `apps/web/lib/jupiter-swap.ts`

**Purpose:** Encapsulate all Jupiter API calls. Returns typed quote responses and swap instructions ready for Squads integration.

- [ ] **Step 1: Create the JupiterSwapService file**

Create `apps/web/lib/jupiter-swap.ts`:

```typescript
"use client";

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { SOL_MINT, USDC_MINT } from "@/lib/tokens";

const JUPITER_API_BASE = "https://quote-api.jup.ag/v6";

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: string | null;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

export interface SwapInstruction {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string;
}

export interface SwapInstructionsResponse {
  tokenLedgerInstruction: SwapInstruction | null;
  computeBudgetInstructions: SwapInstruction[];
  setupInstructions: SwapInstruction[];
  swapInstruction: SwapInstruction;
  cleanupInstruction: SwapInstruction | null;
  addressLookupTableAddresses: string[];
  prioritizationFeeLamports: number;
}

function instructionFromJson(ix: SwapInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.pubkey),
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

export async function getJupiterQuote({
  inputMint = SOL_MINT,
  outputMint = USDC_MINT,
  amount,
  slippageBps = 50,
}: {
  inputMint?: string;
  outputMint?: string;
  amount: string;
  slippageBps?: number;
}): Promise<JupiterQuote> {
  const url = new URL(`${JUPITER_API_BASE}/quote`);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("slippageBps", slippageBps.toString());
  url.searchParams.set("onlyDirectRoutes", "false");
  url.searchParams.set("asLegacyTransaction", "true"); // Legacy = no ALTs needed

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Jupiter quote failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getSwapInstructions({
  quoteResponse,
  userPublicKey,
  wrapAndUnwrapSol = true,
}: {
  quoteResponse: JupiterQuote;
  userPublicKey: PublicKey;
  wrapAndUnwrapSol?: boolean;
}): Promise<TransactionInstruction[]> {
  const response = await fetch(`${JUPITER_API_BASE}/swap-instruction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: userPublicKey.toBase58(),
      wrapAndUnwrapSol,
      asLegacyTransaction: true, // Legacy = no ALTs needed
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Jupiter swap-instruction failed: ${response.status} ${errorText}`);
  }

  const data: SwapInstructionsResponse = await response.json();

  const instructions: TransactionInstruction[] = [
    ...(data.computeBudgetInstructions?.map(instructionFromJson) ?? []),
    ...(data.setupInstructions?.map(instructionFromJson) ?? []),
    instructionFromJson(data.swapInstruction),
    ...(data.cleanupInstruction ? [instructionFromJson(data.cleanupInstruction)] : []),
  ];

  return instructions;
}

export function formatSwapPreview(quote: JupiterQuote): {
  outAmountUi: string;
  priceImpact: string;
  routeLabel: string;
} {
  const outAmountNum = Number(quote.outAmount) / 1_000_000; // USDC has 6 decimals
  const outAmountUi = outAmountNum.toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
  const priceImpact = Number(quote.priceImpactPct).toFixed(4);
  const routeLabel = quote.routePlan
    .map((step) => step.swapInfo.label)
    .join(" → ");

  return { outAmountUi, priceImpact, routeLabel };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/jupiter-swap.ts
git commit -m "feat(swap): add JupiterSwapService for quote and swap instructions

- Implement getJupiterQuote() calling Jupiter v6 /quote API
- Implement getSwapInstructions() calling /swap-instruction API
- Add formatSwapPreview() helper for UI display
- Use legacy transactions to avoid Address Lookup Tables complexity"
```

---

## Task 2: SwapModal Component

**Files:**
- Create: `apps/web/components/vault/SwapModal.tsx`

**Purpose:** Modal UI for swap input, quote display, and Squads proposal creation. Follows the same pattern as SendModal.

- [ ] **Step 1: Create the SwapModal component**

Create `apps/web/components/vault/SwapModal.tsx`:

```tsx
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
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import {
  formatSwapPreview,
  getJupiterQuote,
  getSwapInstructions,
} from "@/lib/jupiter-swap";
import { useVaultBalance } from "@/lib/hooks/useVaultBalance";
import { lamportsToSol, solToLamports } from "@/lib/sol";
import { createVaultProposal } from "@/lib/squads-sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import * as multisigSdk from "@sqds/multisig";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const SLIPPAGE_OPTIONS = [
  { label: "0.1%", value: 10 },
  { label: "0.5%", value: 50 },
  { label: "1%", value: 100 },
];

export function SwapModal({
  multisig,
  open,
  onOpenChange,
}: {
  multisig: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const wallet = useWallet();
  const { startTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
  const { balanceLamports, balanceSol } = useVaultBalance(multisig);

  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof getJupiterQuote>> | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const reset = () => {
    setAmount("");
    setQuote(null);
    setQuoteError(null);
    setError(null);
    setSlippageBps(50);
  };

  const handleClose = (v: boolean) => {
    if (!pending) {
      onOpenChange(v);
      if (!v) reset();
    }
  };

  const handleMaxAmount = useCallback(() => {
    setAmount(balanceSol);
  }, [balanceSol]);

  // Fetch quote when amount or slippage changes
  useEffect(() => {
    if (!amount || Number(amount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const lamports = solToLamports(amount);
        const q = await getJupiterQuote({
          amount: lamports,
          slippageBps,
        });
        setQuote(q);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to get quote";
        setQuoteError(msg);
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 400); // Debounce

    return () => clearTimeout(timeout);
  }, [amount, slippageBps]);

  const preview = useMemo(() => {
    if (!quote) return null;
    return formatSwapPreview(quote);
  }, [quote]);

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

    const lamports = solToLamports(amount);
    if (BigInt(lamports) > BigInt(balanceLamports)) {
      const msg = `Insufficient vault balance. Need ${amount} SOL, vault has ${balanceSol} SOL.`;
      setError(msg);
      return;
    }

    setPending(true);
    startTransaction({
      title: "Creating SOL → USDC swap proposal",
      description: "Building swap instructions via Jupiter and creating a Squads vault proposal.",
      steps: [
        {
          id: "quote",
          title: "Get Jupiter quote",
          description: "Fetching optimal swap route from Jupiter.",
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

      const [vaultPda] = multisigSdk.getVaultPda({
        multisigPda: multisigAddress,
        index: 0,
      });

      const swapInstructions = await getSwapInstructions({
        quoteResponse: quote,
        userPublicKey: vaultPda,
        wrapAndUnwrapSol: true,
      });

      updateStep("build", { status: "success" });
      updateStep("squads", { status: "running" });

      const result = await createVaultProposal({
        connection: wallet.connection,
        wallet,
        multisigPda: multisigAddress,
        instructions: swapInstructions,
        memo: `Swap ${amount} SOL → USDC`,
      });

      updateStep("squads", {
        status: "success",
        signature: result.signature,
        description: `Proposal #${result.transactionIndex.toString()} created on-chain.`,
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
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Swap SOL → USDC</DialogTitle>
          <DialogDescription>
            Swap SOL for USDC via Jupiter. Creates a vault proposal for multisig approval.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-4">
          {/* Amount Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="swap-amount">Amount (SOL)</Label>
              <span className="text-xs text-ink-muted">
                Available:{" "}
                <button
                  type="button"
                  className="font-mono text-accent hover:underline disabled:opacity-50"
                  onClick={handleMaxAmount}
                  disabled={pending}
                >
                  {balanceSol} SOL
                </button>
              </span>
            </div>
            <Input
              id="swap-amount"
              type="number"
              step="0.000000001"
              min="0.000000001"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
            />
          </div>

          {/* Slippage Selector */}
          <div className="flex flex-col gap-1.5">
            <Label>Slippage Tolerance</Label>
            <div className="inline-flex rounded-lg border border-border bg-surface p-1">
              {SLIPPAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => !pending && setSlippageBps(opt.value)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    slippageBps === opt.value
                      ? "bg-accent-soft text-accent"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quote Preview */}
          {quoteLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
              <span className="text-sm text-ink-muted">Fetching quote from Jupiter...</span>
            </div>
          )}

          {quoteError && (
            <p className="rounded-md bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
              {quoteError}
            </p>
          )}

          {preview && !quoteLoading && (
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">You receive</span>
                <span className="text-lg font-semibold text-ink">{preview.outAmountUi} USDC</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-subtle">Route</span>
                  <span className="text-ink-muted">{preview.routeLabel}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-subtle">Price Impact</span>
                  <span
                    className={`${
                      Number(preview.priceImpact) > 1
                        ? "text-signal-danger"
                        : "text-ink-muted"
                    }`}
                  >
                    {preview.priceImpact}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
              {error}
            </p>
          )}

          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-ink-muted">
              This creates a <span className="font-medium text-ink">multisig swap proposal</span>.
              Once enough members approve, any member can execute and the swap will be performed by
              the vault.
            </p>
          </div>

          <DialogFooter className="p-0 pt-0">
            <Button
              type="submit"
              disabled={pending || !amount || !quote || !wallet.publicKey}
              className="w-full gap-2"
            >
              <ArrowLeftRight className="h-4 w-4" />
              {pending ? "Creating proposal..." : "Create Swap Proposal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/vault/SwapModal.tsx
git commit -m "feat(swap): add SwapModal component

- Implement swap UI with SOL input and USDC preview
- Add slippage selector (0.1%, 0.5%, 1%)
- Integrate JupiterSwapService for quotes and instructions
- Create Squads vault proposal with swap instructions
- Follow SendModal patterns for consistency"
```

---

## Task 3: QuickActionBar Integration

**Files:**
- Modify: `apps/web/components/vault/QuickActionBar.tsx`

**Purpose:** Add "Swap" action to the QuickActionBar grid.

- [ ] **Step 1: Add Swap to QuickActionBar**

Modify `apps/web/components/vault/QuickActionBar.tsx`:

```typescript
// Add import at the top
import { SwapModal } from "@/components/vault/SwapModal";
import { ArrowLeftRight } from "lucide-react";

// Add to actions array (after send, before invoice)
const actions = [
  // ... existing actions ...
  {
    id: "swap",
    label: "Swap",
    description: "Swap tokens",
    icon: ArrowLeftRight,
    variant: "default" as const,
  },
  // ... rest of actions ...
];

// Add state for swap modal
const [swapOpen, setSwapOpen] = useState(false);

// In the render, handle swap action
if (action.id === "swap") {
  return (
    <button key={action.id} type="button" onClick={() => setSwapOpen(true)} className={cardClass}>
      {inner}
    </button>
  );
}

// Add SwapModal at the bottom (before closing </>)
<SwapModal multisig={multisig} open={swapOpen} onOpenChange={setSwapOpen} />
```

Full file modification:

```tsx
"use client";

import { ReceiveModal } from "@/components/vault/ReceiveModal";
import { SendModal } from "@/components/vault/SendModal";
import { SwapModal } from "@/components/vault/SwapModal";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, BookOpen, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const actions = [
  {
    id: "receive",
    label: "Receive",
    description: "Deposit funds",
    icon: ArrowDownToLine,
    variant: "default" as const,
  },
  {
    id: "send",
    label: "Send",
    description: "Transfer out",
    icon: ArrowUpFromLine,
    variant: "default" as const,
  },
  {
    id: "swap",
    label: "Swap",
    description: "Swap tokens",
    icon: ArrowLeftRight,
    variant: "default" as const,
  },
  {
    id: "invoice",
    label: "Invoice",
    description: "Request payment",
    icon: BookOpen,
    variant: "default" as const,
  },
  {
    id: "payroll",
    label: "Payroll",
    description: "Batch payments",
    icon: Zap,
    variant: "accent" as const,
  },
];

interface QuickActionBarProps {
  multisig: string;
}

export function QuickActionBar({ multisig }: QuickActionBarProps) {
  const base = `/vault/${multisig}`;
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          const isAccent = action.variant === "accent";

          const inner = (
            <>
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  isAccent
                    ? "bg-accent/10 text-accent"
                    : "bg-surface-2 text-ink-subtle group-hover:bg-accent/10 group-hover:text-accent",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div className="mt-3">
                <p className={cn("text-sm font-semibold", isAccent ? "text-accent" : "text-ink")}>
                  {action.label}
                </p>
                <p className="text-[11px] text-ink-subtle">{action.description}</p>
              </div>
            </>
          );

          const cardClass = cn(
            "group flex w-full flex-col items-start rounded-2xl border p-4 text-left transition-all duration-300",
            isAccent
              ? "border-accent/20 bg-accent/[0.03] hover:border-accent/40 hover:shadow-accent-glow"
              : "border-border/60 bg-surface hover:border-accent/15 hover:shadow-raise-1",
          );

          if (action.id === "receive") {
            return (
              <button key={action.id} type="button" onClick={() => setReceiveOpen(true)} className={cardClass}>
                {inner}
              </button>
            );
          }
          if (action.id === "send") {
            return (
              <button key={action.id} type="button" onClick={() => setSendOpen(true)} className={cardClass}>
                {inner}
              </button>
            );
          }
          if (action.id === "swap") {
            return (
              <button key={action.id} type="button" onClick={() => setSwapOpen(true)} className={cardClass}>
                {inner}
              </button>
            );
          }
          return (
            <Link key={action.id} href={`${base}/${action.id}`} className={cardClass}>
              {inner}
            </Link>
          );
        })}
      </div>

      <ReceiveModal multisig={multisig} open={receiveOpen} onOpenChange={setReceiveOpen} />
      <SendModal multisig={multisig} open={sendOpen} onOpenChange={setSendOpen} />
      <SwapModal multisig={multisig} open={swapOpen} onOpenChange={setSwapOpen} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/vault/QuickActionBar.tsx
git commit -m "feat(swap): add Swap action to QuickActionBar

- Add Swap card between Send and Invoice actions
- Integrate SwapModal with QuickActionBar state management
- Use ArrowLeftRight icon for swap action"
```

---

## Task 4: Testing

**Files:**
- Test: Manual testing on devnet

**Purpose:** Verify the swap flow works end-to-end.

- [ ] **Step 1: Test quote fetching**

Run the app locally and test:
1. Open a vault with SOL balance
2. Click "Swap" in QuickActionBar
3. Enter 0.01 SOL
4. Verify quote loads showing USDC amount

- [ ] **Step 2: Test proposal creation**

1. Click "Create Swap Proposal"
2. Verify transaction progress modal appears
3. Sign with wallet
4. Verify proposal created on Squads

- [ ] **Step 3: Test proposal execution**

1. Approve the proposal (if threshold > 1)
2. Execute the proposal
3. Verify swap executes and USDC arrives in vault

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

Expected: No errors.

---

## Self-Review

### Spec Coverage Check
- ✅ Card no QuickActionBar — Task 3
- ✅ Modal de swap — Task 2
- ✅ Integração Jupiter API — Task 1
- ✅ Criação de proposta Squads — Task 2
- ✅ Transaction progress — Task 2 (reuses existing hook)
- ✅ Slippage configuration — Task 2
- ✅ Quote preview — Task 1 + Task 2
- ✅ Error handling — Task 1 + Task 2

### Placeholder Scan
- ✅ No TBDs
- ✅ No vague "add error handling" — concrete try/catch in all async functions
- ✅ Complete code in every step
- ✅ Exact file paths

### Type Consistency
- ✅ `JupiterQuote` interface matches Jupiter v6 API response
- ✅ `getSwapInstructions` returns `TransactionInstruction[]`
- ✅ `createVaultProposal` accepts `TransactionInstruction[]`
- ✅ `SwapModal` follows same pattern as `SendModal`

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2024-05-04-swap-implementation.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**

"use client";

import { Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { SOL_MINT, USDC_MINT } from "@/lib/tokens";

const JUPITER_API_BASE = "/api";
const DEFAULT_DECIMALS = 6;
const FETCH_TIMEOUT_MS = 10_000;

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
  priceImpact: number;
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
  transaction: string | null;
  lastValidBlockHeight: string;
  router: string;
  requestId: string;
  expireAt: string;
}

function extractInstructionsFromTransaction(
  transactionBase64: string
): TransactionInstruction[] {
  const buffer = Buffer.from(transactionBase64, "base64");
  
  // Try VersionedTransaction first
  try {
    const versionedTx = VersionedTransaction.deserialize(buffer);
    const message = versionedTx.message;
    
    return message.compiledInstructions.map((ix) => {
      const accountKeys = message.staticAccountKeys;
      const programId = accountKeys[ix.programIdIndex];
      if (!programId) throw new Error("Invalid program ID index in transaction");
      
      return new TransactionInstruction({
        programId,
        keys: ix.accountKeyIndexes.map((idx) => {
          const pubkey = accountKeys[idx];
          if (!pubkey) throw new Error(`Invalid account index ${idx} in transaction`);
          return {
            pubkey,
            isSigner: message.isAccountSigner(idx),
            isWritable: message.isAccountWritable(idx),
          };
        }),
        data: Buffer.from(ix.data),
      });
    });
  } catch {
    // Fallback to legacy Transaction
    const legacyTx = Transaction.from(buffer);
    return legacyTx.instructions;
  }
}

export async function getJupiterQuote({
  inputMint = SOL_MINT,
  outputMint = USDC_MINT,
  amount,
  slippageBps = 50,
  taker,
}: {
  inputMint?: string;
  outputMint?: string;
  amount: string;
  slippageBps?: number;
  taker?: string;
}): Promise<JupiterQuote> {
  const url = new URL(`${window.location.origin}${JUPITER_API_BASE}/jupiter-quote`);
  if (!/^\d+$/.test(amount) || amount === "0") {
    throw new Error("amount must be a positive integer string");
  }

  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("slippageBps", slippageBps.toString());
  if (taker) {
    url.searchParams.set("taker", taker);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(url.toString(), { signal: controller.signal });
  clearTimeout(timeoutId);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Jupiter quote failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export function getSwapInstructions(quoteResponse: JupiterQuote): TransactionInstruction[] {
  if (!quoteResponse.transaction) {
    throw new Error("Quote does not contain a transaction. Make sure to provide a taker address.");
  }
  return extractInstructionsFromTransaction(quoteResponse.transaction);
}

export function formatSwapPreview(
  quote: JupiterQuote,
  outputDecimals: number = DEFAULT_DECIMALS
): {
  outAmountUi: string;
  priceImpact: string;
  routeLabel: string;
} {
  const outAmountNum = Number(quote.outAmount) / 10 ** outputDecimals;
  const outAmountUi = outAmountNum.toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
  const priceImpact = Number(quote.priceImpactPct).toFixed(4);
  const routeLabel = quote.routePlan
    .map((step) => step.swapInfo.label)
    .join(" → ");

  return { outAmountUi, priceImpact, routeLabel };
}

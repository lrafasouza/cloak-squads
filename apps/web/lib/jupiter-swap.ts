"use client";

import { publicEnv } from "@/lib/env";
import { SOL_MINT, USDC_MINT } from "@/lib/tokens";
import { Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";

const JUPITER_API_BASE = "/api";
const DEFAULT_DECIMALS = 6;
const FETCH_TIMEOUT_MS = 10_000;

const IS_DEVNET = publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER === "devnet";

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

function extractInstructionsFromTransaction(transactionBase64: string): TransactionInstruction[] {
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
  if (!/^\d+$/.test(amount) || amount === "0") {
    throw new Error("amount must be a positive integer string");
  }

  // Use Orca on devnet, Jupiter on mainnet
  const endpoint = IS_DEVNET ? "/orca-quote" : "/jupiter-quote";
  const url = new URL(`${window.location.origin}${JUPITER_API_BASE}${endpoint}`);

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
    throw new Error(`Swap quote failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getSwapInstructions(
  quoteResponse: JupiterQuote,
  userPublicKey?: string,
): Promise<TransactionInstruction[]> {
  // On devnet, fetch instructions from Orca swap endpoint
  if (IS_DEVNET) {
    if (!userPublicKey) {
      throw new Error("userPublicKey is required for devnet Orca swaps.");
    }
    // Orca devnet: instructions are returned via the /orca-swap endpoint
    const url = `${window.location.origin}${JUPITER_API_BASE}/orca-swap`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse, userPublicKey }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Orca swap build failed: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      return data.instructions;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Mainnet: extract from serialized transaction
  if (!quoteResponse.transaction) {
    throw new Error("Quote does not contain a transaction. Make sure to provide a taker address.");
  }
  return extractInstructionsFromTransaction(quoteResponse.transaction);
}

export function formatSwapPreview(
  quote: JupiterQuote,
  outputDecimals: number = DEFAULT_DECIMALS,
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
  const routeLabel = quote.routePlan.map((step) => step.swapInfo.label).join(" → ");

  return { outAmountUi, priceImpact, routeLabel };
}

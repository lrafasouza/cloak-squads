"use client";

import { publicEnv } from "@/lib/env";
import { SOL_MINT, USDC_MINT } from "@/lib/tokens";
import { Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";

const API_BASE = "/api";
const FETCH_TIMEOUT_MS = 10_000;

export interface RaydiumQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  slippageBps: number;
  priceImpactPct: string;
  routeLabel: string;
  rawSwapData?: unknown;
}

function extractInstructions(transactionBase64: string): TransactionInstruction[] {
  const buffer = Buffer.from(transactionBase64, "base64");
  try {
    const versionedTx = VersionedTransaction.deserialize(buffer);
    const message = versionedTx.message;
    return message.compiledInstructions.map((ix) => {
      const accountKeys = message.staticAccountKeys;
      const programId = accountKeys[ix.programIdIndex];
      if (!programId) throw new Error("Invalid program ID index");
      return new TransactionInstruction({
        programId,
        keys: ix.accountKeyIndexes.map((idx) => {
          const pubkey = accountKeys[idx];
          if (!pubkey) throw new Error(`Invalid account index ${idx}`);
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
    const legacyTx = Transaction.from(buffer);
    return legacyTx.instructions;
  }
}

export async function getRaydiumQuote({
  inputMint = SOL_MINT,
  outputMint = USDC_MINT,
  amount,
  slippageBps = 50,
}: {
  inputMint?: string;
  outputMint?: string;
  amount: string;
  slippageBps?: number;
}): Promise<RaydiumQuote> {
  if (!/^\d+$/.test(amount) || amount === "0") {
    throw new Error("amount must be a positive integer string");
  }

  const url = new URL(`${window.location.origin}${API_BASE}/raydium-quote`);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("slippageBps", slippageBps.toString());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(url.toString(), { signal: controller.signal });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Raydium quote failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getRaydiumSwapInstructions(
  quote: RaydiumQuote,
  vaultPda: string,
): Promise<TransactionInstruction[]> {
  const response = await fetch(`${API_BASE}/raydium-swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      computeUnitPriceMicroLamports: "100000",
      swapResponse: quote.rawSwapData,
      rawSwapData: quote.rawSwapData,
      txVersion: "V0",
      wallet: vaultPda,
      wrapSol: true,
      unwrapSol: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Raydium swap failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { data?: Array<{ transaction: string }> };
  const transactions = data?.data ?? [];
  if (!transactions.length) throw new Error("No swap transaction returned from Raydium");

  return transactions.flatMap((tx) => extractInstructions(tx.transaction));
}

export function formatSwapPreview(
  quote: RaydiumQuote,
  outputDecimals = 6,
): { outAmountUi: string; priceImpact: string; routeLabel: string } {
  const outAmountNum = Number(quote.outputAmount) / 10 ** outputDecimals;
  const outAmountUi = outAmountNum.toLocaleString("en-US", { maximumFractionDigits: 6 });
  const priceImpact = Number(quote.priceImpactPct).toFixed(4);
  return { outAmountUi, priceImpact, routeLabel: quote.routeLabel };
}

export const isDevnet = () => publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER !== "mainnet-beta";

export const SWAP_PROVIDER = "Orca";

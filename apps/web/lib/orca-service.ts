import { publicEnv } from "@/lib/env";
import { SOL_MINT, USDC_MINT } from "@/lib/tokens";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Percentage, ReadOnlyWallet } from "@orca-so/common-sdk";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  SwapUtils,
} from "@orca-so/whirlpools-sdk";
import { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js";

const DEVNET_SOL_USDC_POOL = "3uT2EH9zrvX9FV2ZWckNUWi81GgHUGD65N6P7V3Jm3tT";
const DEVNET_FALLBACK_RATE = 150; // 1 SOL = 150 USDC

export interface OrcaQuote {
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

function getConnection(): Connection {
  return new Connection(publicEnv.NEXT_PUBLIC_RPC_URL, "confirmed");
}

function getWhirlpoolContext(): WhirlpoolContext {
  const connection = getConnection();
  const wallet = new ReadOnlyWallet(Keypair.generate().publicKey);
  const provider = new AnchorProvider(connection, wallet as unknown as Parameters<typeof AnchorProvider>[1], {
    commitment: "confirmed",
  });
  return WhirlpoolContext.withProvider(provider);
}

export async function getOrcaQuote({
  inputMint,
  outputMint,
  amount,
  slippageBps = 50,
}: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}): Promise<OrcaQuote> {
  if (publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER !== "devnet") {
    throw new Error("Orca swap is only available on devnet. Use Jupiter for mainnet.");
  }

  const supportedMints = [SOL_MINT, USDC_MINT];
  if (!supportedMints.includes(inputMint) || !supportedMints.includes(outputMint)) {
    throw new Error("Devnet swap only supports SOL/USDC pair");
  }

  try {
    const ctx = getWhirlpoolContext();
    const client = buildWhirlpoolClient(ctx);
    const poolAddress = new PublicKey(DEVNET_SOL_USDC_POOL);
    const whirlpool = await client.getPool(poolAddress);

    const inputDecimals = inputMint === SOL_MINT ? 9 : 6;
    const amountBN = new BN(amount);
    const slippage = Percentage.fromFraction(slippageBps, 10000);

    const quote = await swapQuoteByInputToken(
      whirlpool,
      new PublicKey(inputMint),
      amountBN,
      slippage,
      ctx.program.programId,
      ctx.fetcher,
    );

    const outAmount = quote.estimatedAmountOut.toString();
    const priceImpact = new Decimal(quote.estimatedPriceImpact.toString()).toNumber();

    return {
      inputMint,
      outputMint,
      inAmount: amount,
      outAmount,
      otherAmountThreshold: outAmount,
      swapMode: "ExactIn",
      slippageBps,
      platformFee: null,
      priceImpactPct: priceImpact.toFixed(4),
      priceImpact,
      routePlan: [
        {
          swapInfo: {
            ammKey: DEVNET_SOL_USDC_POOL,
            label: "Orca Whirlpool",
            inputMint,
            outputMint,
            inAmount: amount,
            outAmount,
            feeAmount: quote.estimatedFeeAmount.toString(),
            feeMint: inputMint,
          },
          percent: 100,
        },
      ],
      transaction: null,
      lastValidBlockHeight: "0",
      router: "orca",
      requestId: `orca-${Date.now()}`,
      expireAt: new Date(Date.now() + 60000).toISOString(),
    };
  } catch (error) {
    console.warn("Orca pool not available, using fallback rate:", error);

    const inputDecimals = inputMint === SOL_MINT ? 9 : 6;
    const outputDecimals = outputMint === SOL_MINT ? 9 : 6;
    const amountNum = Number(amount) / 10 ** inputDecimals;
    const rate = inputMint === SOL_MINT ? DEVNET_FALLBACK_RATE : 1 / DEVNET_FALLBACK_RATE;
    const outAmountNum = amountNum * rate;
    const outAmount = Math.floor(outAmountNum * 10 ** outputDecimals).toString();

    return {
      inputMint,
      outputMint,
      inAmount: amount,
      outAmount,
      otherAmountThreshold: outAmount,
      swapMode: "ExactIn",
      slippageBps,
      platformFee: null,
      priceImpactPct: "0.0000",
      priceImpact: 0,
      routePlan: [
        {
          swapInfo: {
            ammKey: DEVNET_SOL_USDC_POOL,
            label: "Orca Whirlpool (Devnet Fallback)",
            inputMint,
            outputMint,
            inAmount: amount,
            outAmount,
            feeAmount: "0",
            feeMint: inputMint,
          },
          percent: 100,
        },
      ],
      transaction: null,
      lastValidBlockHeight: "0",
      router: "orca",
      requestId: `orca-fallback-${Date.now()}`,
      expireAt: new Date(Date.now() + 60000).toISOString(),
    };
  }
}

export async function buildOrcaSwapInstructions({
  quote,
  userPublicKey,
}: {
  quote: OrcaQuote;
  userPublicKey: string;
}): Promise<{ instructions: TransactionInstruction[]; addressLookupTableAccounts: string[] }> {
  if (publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER !== "devnet") {
    throw new Error("Orca swap is only available on devnet");
  }

  try {
    const ctx = getWhirlpoolContext();
    const client = buildWhirlpoolClient(ctx);
    const poolAddress = new PublicKey(DEVNET_SOL_USDC_POOL);
    const whirlpool = await client.getPool(poolAddress);
    const userPubkey = new PublicKey(userPublicKey);

    const inputMint = new PublicKey(quote.inputMint);
    const inputDecimals = quote.inputMint === SOL_MINT ? 9 : 6;
    const amountBN = new BN(quote.inAmount);
    const slippage = Percentage.fromFraction(quote.slippageBps, 10000);

    const swapQuote = await swapQuoteByInputToken(
      whirlpool,
      inputMint,
      amountBN,
      slippage,
      ctx.program.programId,
      ctx.fetcher,
    );

    const txBuilder = await swapAsync(ctx, {
      whirlpool,
      wallet: userPubkey,
      swapInput: {
        amount: swapQuote.estimatedAmountIn,
        otherAmountThreshold: swapQuote.estimatedAmountOut,
        sqrtPriceLimit: swapQuote.sqrtPriceLimit,
        amountSpecifiedIsInput: true,
        aToB: swapQuote.aToB,
        tickArray0: swapQuote.tickArray0,
        tickArray1: swapQuote.tickArray1,
        tickArray2: swapQuote.tickArray2,
      },
    });

    return {
      instructions: txBuilder.instructions,
      addressLookupTableAccounts: [],
    };
  } catch (error) {
    console.error("Failed to build Orca swap instructions:", error);
    throw new Error(
      `Failed to build swap instructions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

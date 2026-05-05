import {
  setNativeMintWrappingStrategy,
  setWhirlpoolsConfig,
  swapInstructions,
} from "@orca-so/whirlpools";
import { address, createNoopSigner, createSolanaRpc } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";

const RAYDIUM_API = "https://api-v3.raydium.io";

const DEVNET_SOL_USDC_POOL = "3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt";
const DEVNET_USDC = "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k";
const SOL_MINT = "So11111111111111111111111111111111111111112";

const NOOP_SIGNER_ADDRESS = "11111111111111111111111111111112";

let configInitialized = false;
async function ensureDevnetConfig() {
  if (configInitialized) return;
  await setWhirlpoolsConfig("solanaDevnet");
  setNativeMintWrappingStrategy("ata");
  configInitialized = true;
}

async function getOrcaDevnetQuote(
  inputMint: string,
  outputMint: string,
  amountStr: string,
  slippageBps: number,
) {
  await ensureDevnetConfig();

  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
  const rpc = createSolanaRpc(rpcUrl);
  const inputMintPk = inputMint === SOL_MINT ? SOL_MINT : DEVNET_USDC;

  // Validate mint address format
  try {
    new PublicKey(inputMintPk);
  } catch {
    throw new Error(`Invalid input mint: ${inputMintPk}`);
  }

  const signer = createNoopSigner(address(NOOP_SIGNER_ADDRESS));

  const result = await swapInstructions(
    rpc,
    { inputAmount: BigInt(amountStr), mint: address(inputMintPk) },
    address(DEVNET_SOL_USDC_POOL),
    slippageBps,
    signer,
  );

  const quote = result.quote as { tokenEstOut: bigint; tokenMinOut: bigint };

  return {
    inputMint,
    outputMint,
    inputAmount: amountStr,
    outputAmount: quote.tokenEstOut.toString(),
    minOutputAmount: quote.tokenMinOut.toString(),
    slippageBps,
    priceImpactPct: "0.10",
    routeLabel: "Orca Whirlpool (devnet)",
    rawSwapData: {
      source: "orca-devnet",
      inputMint,
      outputMint,
      amount: amountStr,
      slippageBps,
    },
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const inputMint = searchParams.get("inputMint") ?? SOL_MINT;
  const outputMint = searchParams.get("outputMint") ?? DEVNET_USDC;
  const amount = searchParams.get("amount") ?? "0";
  const slippageBps = Number(searchParams.get("slippageBps") ?? "50");

  if (cluster !== "mainnet-beta") {
    try {
      const quote = await getOrcaDevnetQuote(inputMint, outputMint, amount, slippageBps);
      return NextResponse.json(quote);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "Orca devnet quote failed", details: message },
        { status: 500 },
      );
    }
  }

  const targetUrl = `${RAYDIUM_API}/compute/swap-base-in?${searchParams.toString()}&txVersion=V0`;
  try {
    const response = await fetch(targetUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      const err = await response.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `Raydium API error: ${response.status}`, details: err },
        { status: response.status },
      );
    }

    const data = (await response.json()) as {
      data?: {
        data?: Array<{
          inputMint: string;
          outputMint: string;
          inputAmount: string;
          outputAmount: string;
          slippage: number;
          priceImpactPct: number;
          routePlan?: Array<{ poolId: string }>;
        }>;
      };
    };

    const swapData = data?.data?.data?.[0];
    if (!swapData) return NextResponse.json({ error: "No swap route found" }, { status: 404 });

    return NextResponse.json({
      inputMint: swapData.inputMint,
      outputMint: swapData.outputMint,
      inputAmount: swapData.inputAmount,
      outputAmount: swapData.outputAmount,
      slippageBps: swapData.slippage,
      priceImpactPct: String(swapData.priceImpactPct ?? "0"),
      routeLabel:
        swapData.routePlan?.map((r) => `${r.poolId.slice(0, 6)}…`).join(" → ") ?? "Raydium",
      rawSwapData: { source: "raydium", ...swapData },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch from Raydium", details: String(err) },
      { status: 500 },
    );
  }
}

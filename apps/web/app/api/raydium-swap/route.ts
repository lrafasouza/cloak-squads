import {
  setNativeMintWrappingStrategy,
  setWhirlpoolsConfig,
  swapInstructions,
} from "@orca-so/whirlpools";
import {
  AccountRole,
  type Instruction,
  address,
  createNoopSigner,
  createSolanaRpc,
} from "@solana/kit";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";

const RAYDIUM_API = "https://api-v3.raydium.io";

const DEVNET_SOL_USDC_POOL = "3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt";
const DEVNET_USDC = "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k";
const SOL_MINT = "So11111111111111111111111111111111111111112";

let configInitialized = false;
async function ensureDevnetConfig() {
  if (configInitialized) return;
  await setWhirlpoolsConfig("solanaDevnet");
  // Default "keypair" strategy creates ephemeral signers that Squads can't sign for.
  // "ata" routes wrapping through the vault's WSOL ATA — all signers stay as the
  // vault PDA, which Squads CPIs on the proposal's behalf.
  setNativeMintWrappingStrategy("ata");
  configInitialized = true;
}

function kitInstructionToWeb3(ix: Instruction): TransactionInstruction {
  const accounts = ix.accounts ?? [];
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: accounts.map((account) => {
      const role = account.role;
      // AccountRole: WRITABLE_SIGNER=3, READONLY_SIGNER=2, WRITABLE=1, READONLY=0
      const isSigner = role === AccountRole.WRITABLE_SIGNER || role === AccountRole.READONLY_SIGNER;
      const isWritable = role === AccountRole.WRITABLE_SIGNER || role === AccountRole.WRITABLE;
      const accountWithAddress = account as { address: string };
      return {
        pubkey: new PublicKey(accountWithAddress.address),
        isSigner,
        isWritable,
      };
    }),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

async function buildOrcaDevnetSwap(rawSwapData: Record<string, unknown>, walletAddress: string) {
  await ensureDevnetConfig();

  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
  const rpc = createSolanaRpc(rpcUrl);

  // Validate vault PDA
  let vaultPda: PublicKey;
  try {
    vaultPda = new PublicKey(walletAddress);
  } catch {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }

  const inputMintStr = rawSwapData.inputMint as string;
  const inputMintPk = inputMintStr === SOL_MINT ? SOL_MINT : DEVNET_USDC;
  const slippageBps = Number(rawSwapData.slippageBps ?? 50);
  const amount = rawSwapData.amount as string;

  // The vault PDA is the swap funder/owner. createNoopSigner allows building
  // instructions referencing the vault PDA without it actually signing here.
  const signer = createNoopSigner(address(vaultPda.toBase58()));

  const result = await swapInstructions(
    rpc,
    { inputAmount: BigInt(amount), mint: address(inputMintPk) },
    address(DEVNET_SOL_USDC_POOL),
    slippageBps,
    signer,
  );

  const swapIxs = result.instructions.map(kitInstructionToWeb3);

  // Build a versioned transaction so the client can deserialize and extract
  // instructions for the Squads proposal (matches existing extractInstructions
  // helper which expects a base64 transaction).
  const { blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send()
    .then((r) => r.value);

  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
      ...swapIxs,
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  return Buffer.from(tx.serialize()).toString("base64");
}

export async function POST(request: NextRequest) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

  try {
    const body = (await request.json()) as {
      swapResponse?: Record<string, unknown>;
      rawSwapData?: Record<string, unknown>;
      wallet?: string;
      computeUnitPriceMicroLamports?: string;
      txVersion?: string;
      wrapSol?: boolean;
      unwrapSol?: boolean;
    };

    if (cluster !== "mainnet-beta") {
      const swapData = body.rawSwapData ?? body.swapResponse;
      if (!swapData || !body.wallet) {
        return NextResponse.json(
          { error: "rawSwapData/swapResponse and wallet are required" },
          { status: 400 },
        );
      }
      const transaction = await buildOrcaDevnetSwap(swapData, body.wallet);
      return NextResponse.json({ data: [{ transaction }] });
    }

    const response = await fetch(`${RAYDIUM_API}/transaction/swap-base-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `Raydium API error: ${response.status}`, details: err },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to build swap transaction", details: message },
      { status: 500 },
    );
  }
}

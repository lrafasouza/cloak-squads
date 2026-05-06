/**
 * Privacy meter — reads anonymity set size and pool depth from the Cloak
 * devnet shielded pool on-chain. Uses readMerkleTreeState to get nextIndex
 * (= total deposits ever) and the vaultAuthority balance for pool depth.
 *
 * Threat-model honesty: vault→operator hop is public. The anonymity guarantee
 * is that no observer can link a specific vault deposit to a specific withdrawal
 * because the pool contains many other deposits. A larger nextIndex = larger
 * anonymity set = lower risk.
 */
import { publicEnv } from "@/lib/env";
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  getShieldPoolPDAs,
  readMerkleTreeState,
} from "@cloak.dev/sdk-devnet";
import { Connection, PublicKey } from "@solana/web3.js";

export type PoolStats = {
  mint: string;
  /** Total deposits ever (nextIndex from merkle tree state) */
  anonymitySetTotal: number;
  /** SOL shielded in pool right now (lamports) */
  poolDepthLamports: bigint;
  /** Simple risk score based on total deposit count */
  riskScore: "low" | "medium" | "high";
  updatedAt: number;
};

function riskScore(anonymitySetTotal: number): "low" | "medium" | "high" {
  if (anonymitySetTotal >= 1000) return "low";
  if (anonymitySetTotal >= 100) return "medium";
  return "high";
}

export async function getPoolStats(mint?: string): Promise<PoolStats> {
  const connection = new Connection(publicEnv.NEXT_PUBLIC_RPC_URL, "confirmed");
  const mintPk = mint ? new PublicKey(mint) : NATIVE_SOL_MINT;
  const isSol = mintPk.equals(NATIVE_SOL_MINT);

  const pdas = getShieldPoolPDAs(CLOAK_PROGRAM_ID, isSol ? undefined : mintPk);

  let anonymitySetTotal = 0;
  try {
    const state = await readMerkleTreeState(connection, pdas.merkleTree, true);
    anonymitySetTotal = state.nextIndex;
  } catch {
    // Pool not initialized or RPC error — return zeros
  }

  let poolDepthLamports = 0n;
  try {
    const balance = await connection.getBalance(pdas.vaultAuthority, "confirmed");
    poolDepthLamports = BigInt(balance);
  } catch {
    /* ignore */
  }

  return {
    mint: mintPk.toBase58(),
    anonymitySetTotal,
    poolDepthLamports,
    riskScore: riskScore(anonymitySetTotal),
    updatedAt: Date.now(),
  };
}

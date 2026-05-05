import { publicEnv } from "@/lib/env";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

// On devnet, use the mint paired with SOL in the Orca Whirlpool devnet pool
// (3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt). On mainnet, use Circle USDC.
export const USDC_MINT =
  publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta"
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k";

export const USDC_DECIMALS = 6;

export function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  if (remainder === 0n) return whole.toString();
  return `${whole}.${remainder.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function tokenAmountToUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

/** Format a raw on-chain token amount (lamports / micro-USDC) with its symbol. */
export function formatRawAmount(amount: string | bigint, tokenMint: string): string {
  const n = typeof amount === "bigint" ? amount : BigInt(amount);
  if (tokenMint === SOL_MINT) {
    const whole = n / 1_000_000_000n;
    const rem = n % 1_000_000_000n;
    const frac = rem === 0n ? "" : `.${rem.toString().padStart(9, "0").replace(/0+$/, "")}`;
    return `${whole}${frac} SOL`;
  }
  return `${formatTokenAmount(n, USDC_DECIMALS)} USDC`;
}

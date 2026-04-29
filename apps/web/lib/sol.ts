import { solAmountToLamports } from "@cloak-squads/core/amount";

const LAMPORTS_PER_SOL = 1_000_000_000n;

/** "2.5" → "2500000000" — throws on invalid input */
export function solToLamports(sol: string): string {
  return solAmountToLamports(sol).toString();
}

/** 2500000000 → "2.5" */
export function lamportsToSol(lamports: string | number | bigint): string {
  const l = BigInt(lamports);
  const whole = l / LAMPORTS_PER_SOL;
  const remainder = l % LAMPORTS_PER_SOL;
  if (remainder === 0n) return whole.toString();
  return `${whole}.${remainder.toString().padStart(9, "0").replace(/0+$/, "")}`;
}

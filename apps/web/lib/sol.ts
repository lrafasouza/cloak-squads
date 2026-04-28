const LAMPORTS_PER_SOL = 1_000_000_000n;

/** "2.5" → "2500000000" — throws on invalid input */
export function solToLamports(sol: string): string {
  const trimmed = sol.trim();
  if (!trimmed) throw new Error("Amount is required.");

  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Invalid amount. Use a number like 2 or 0.5.");

  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > 9) throw new Error("Maximum 9 decimal places (1 lamport precision).");

  const lamports = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(frac.padEnd(9, "0"));
  if (lamports <= 0n) throw new Error("Amount must be greater than 0.");

  return lamports.toString();
}

/** 2500000000 → "2.5" */
export function lamportsToSol(lamports: string | number | bigint): string {
  const l = BigInt(lamports);
  const whole = l / LAMPORTS_PER_SOL;
  const remainder = l % LAMPORTS_PER_SOL;
  if (remainder === 0n) return whole.toString();
  return `${whole}.${remainder.toString().padStart(9, "0").replace(/0+$/, "")}`;
}

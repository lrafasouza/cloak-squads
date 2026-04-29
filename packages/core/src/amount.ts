const LAMPORTS_PER_SOL = 1_000_000_000n;

export function solAmountToLamports(sol: string): bigint {
  const trimmed = sol.trim();
  if (!trimmed) throw new Error("Amount is required.");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Invalid amount. Use a number like 2 or 0.5.");
  }

  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > 9) {
    throw new Error("Maximum 9 decimal places (1 lamport precision).");
  }

  const lamports = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(frac.padEnd(9, "0"));
  if (lamports <= 0n) throw new Error("Amount must be greater than 0.");
  return lamports;
}

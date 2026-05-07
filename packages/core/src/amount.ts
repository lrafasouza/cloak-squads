const LAMPORTS_PER_SOL = 1_000_000_000n;

// Cloak shield pool rejects deposits below 0.01 SOL. This is enforced by
// @cloak.dev/sdk-devnet (MIN_DEPOSIT_LAMPORTS) at execute time; we mirror it
// here so proposals can't be created below the threshold and silently fail
// during the operator's Cloak deposit step.
export const MIN_PRIVATE_DEPOSIT_LAMPORTS = 10_000_000n;
export const MIN_PRIVATE_DEPOSIT_SOL = "0.01";

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

export function assertPrivateSolMinimum(lamports: bigint, label = "Amount"): void {
  if (lamports < MIN_PRIVATE_DEPOSIT_LAMPORTS) {
    throw new Error(
      `${label} is below the Cloak minimum of ${MIN_PRIVATE_DEPOSIT_SOL} SOL. Increase the amount or send publicly.`,
    );
  }
}

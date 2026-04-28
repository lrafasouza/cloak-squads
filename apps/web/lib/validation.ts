import { PublicKey } from "@solana/web3.js";

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function validateAmount(amount: string): { valid: boolean; error?: string; value?: bigint } {
  if (!amount || amount.trim() === "") {
    return { valid: false, error: "Amount is required" };
  }

  if (!/^[0-9]+$/.test(amount)) {
    return { valid: false, error: "Amount must be a positive integer" };
  }

  try {
    const value = BigInt(amount);
    if (value <= 0n) {
      return { valid: false, error: "Amount must be greater than 0" };
    }
    if (value > 18446744073709551615n) {
      return { valid: false, error: "Amount exceeds maximum value" };
    }
    return { valid: true, value };
  } catch {
    return { valid: false, error: "Invalid amount format" };
  }
}

export function truncateAddress(address: string, startChars = 4, endChars = 4): string {
  if (!address || address.length <= startChars + endChars + 3) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

export function formatLamports(lamports: string | number | bigint): string {
  const value = typeof lamports === "string" ? BigInt(lamports) : BigInt(lamports);
  return `${value.toLocaleString()} lamports`;
}

export function formatSOL(lamports: string | number | bigint): string {
  const value = typeof lamports === "string" ? BigInt(lamports) : BigInt(lamports);
  const sol = Number(value) / 1e9;
  return `${sol.toFixed(9)} SOL`;
}

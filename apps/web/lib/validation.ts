import { PublicKey } from "@solana/web3.js";

export function isValidPublicKey(address: string): boolean {
  try {
    const pk = new PublicKey(address);
    return PublicKey.isOnCurve(pk.toBytes());
  } catch {
    return false;
  }
}

export function safePublicKey(address: string): PublicKey | null {
  try {
    const pk = new PublicKey(address);
    return PublicKey.isOnCurve(pk.toBytes()) ? pk : null;
  } catch {
    return null;
  }
}

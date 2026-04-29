/**
 * Server-side wallet authentication for API routes.
 *
 * Scheme:
 *   1. Client signs message `aegis:${base58Pubkey}:${unixSeconds}` with wallet
 *   2. Client sends headers: x-solana-pubkey, x-solana-signature, x-solana-timestamp
 *   3. Server verifies signature + checks timestamp is within AUTH_WINDOW_SECS
 *
 * The signature is Ed25519 (Solana native), verified via nacl.
 */
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const AUTH_WINDOW_SECS = 5 * 60; // 5 minutes

export type WalletAuthResult =
  | { ok: true; publicKey: string }
  | { ok: false; error: string; status: number };

/**
 * Verify wallet authentication from incoming request headers.
 * Call this at the top of any API route handler.
 */
export async function verifyWalletAuth(): Promise<WalletAuthResult> {
  const hdrs = await headers();

  const pubkeyB58 = hdrs.get("x-solana-pubkey");
  const signatureB58 = hdrs.get("x-solana-signature");
  const timestampStr = hdrs.get("x-solana-timestamp");

  if (!pubkeyB58 || !signatureB58 || !timestampStr) {
    return { ok: false, error: "Wallet authentication required. Connect your wallet.", status: 401 };
  }

  // Validate pubkey
  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = new PublicKey(pubkeyB58).toBytes();
  } catch {
    return { ok: false, error: "Invalid wallet public key.", status: 401 };
  }

  // Validate timestamp freshness
  const timestamp = Number(timestampStr);
  if (Number.isNaN(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > AUTH_WINDOW_SECS) {
    return { ok: false, error: "Auth timestamp expired. Re-authenticate.", status: 401 };
  }

  // Verify Ed25519 signature
  const message = `aegis:${pubkeyB58}:${timestampStr}`;
  const messageBytes = new TextEncoder().encode(message);

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(signatureB58);
  } catch {
    return { ok: false, error: "Invalid signature encoding.", status: 401 };
  }

  const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
  if (!valid) {
    return { ok: false, error: "Invalid wallet signature.", status: 401 };
  }

  return { ok: true, publicKey: pubkeyB58 };
}

/**
 * Helper: if auth fails, return the error response directly.
 */
export function authErrorResponse(result: WalletAuthResult): Response | null {
  if (result.ok) return null;
  return NextResponse.json({ error: result.error }, { status: result.status });
}

/**
 * Optional: verify that the authenticated wallet is a member/authorized
 * for a given multisig. This is a placeholder — real membership check
 * would query the on-chain Multisig account for the `members` array.
 * For now we just confirm the auth is valid.
 */
export async function requireWalletAuth(): Promise<{ publicKey: string } | NextResponse> {
  const auth = await verifyWalletAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return { publicKey: auth.publicKey };
}

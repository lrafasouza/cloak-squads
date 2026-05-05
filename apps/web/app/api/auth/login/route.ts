/**
 * POST /api/auth/login
 *
 * One-shot wallet sign-in: client signs `aegis:session:{pubkey}:{ts}:{nonce}`
 * with their wallet, server verifies the signature, and an httpOnly session
 * cookie is set so subsequent API calls authenticate without re-prompting
 * the wallet for every request.
 */
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, createSessionToken } from "@/lib/auth-session";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import nacl from "tweetnacl";

const AUTH_WINDOW_SECS = 5 * 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const {
    publicKey: pubkeyB58,
    signature: signatureB58,
    timestamp,
    nonce,
  } = body as {
    publicKey?: unknown;
    signature?: unknown;
    timestamp?: unknown;
    nonce?: unknown;
  };

  if (
    typeof pubkeyB58 !== "string" ||
    typeof signatureB58 !== "string" ||
    typeof timestamp !== "number" ||
    typeof nonce !== "string" ||
    nonce.length === 0
  ) {
    return NextResponse.json({ error: "Missing or invalid fields." }, { status: 400 });
  }

  let pubkeyBytes: Uint8Array;
  try {
    pubkeyBytes = new PublicKey(pubkeyB58).toBytes();
  } catch {
    return NextResponse.json({ error: "Invalid public key." }, { status: 400 });
  }

  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > AUTH_WINDOW_SECS) {
    return NextResponse.json({ error: "Timestamp expired or invalid." }, { status: 401 });
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(signatureB58);
  } catch {
    return NextResponse.json({ error: "Invalid signature encoding." }, { status: 401 });
  }

  const message = `aegis:session:${pubkeyB58}:${timestamp}:${nonce}`;
  const messageBytes = new TextEncoder().encode(message);

  const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const { token, expiresAt } = createSessionToken(pubkeyB58);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return NextResponse.json({ ok: true, publicKey: pubkeyB58, expiresAt });
}

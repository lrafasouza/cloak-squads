/**
 * Tests for apps/web/lib/wallet-auth.ts — S6 signature format verification
 *
 * Uses verifyWalletAuthHeaders (pure function) to avoid needing a Next.js
 * request context that headers() requires.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { verifyWalletAuthHeaders } from "../../apps/web/lib/wallet-auth";

function makeKeypair() {
  return nacl.sign.keyPair();
}

function signMessage(message: string, secretKey: Uint8Array): string {
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = nacl.sign.detached(msgBytes, secretKey);
  return bs58.encode(sigBytes);
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function makeHeaders(map: Record<string, string>) {
  return { get: (key: string) => map[key] ?? null };
}

beforeEach(() => {
  delete process.env.ALLOW_LEGACY_AUTH;
});

afterEach(() => {
  delete process.env.ALLOW_LEGACY_AUTH;
});

describe("v2 signature (endpoint-bound)", () => {
  test("valid v2 signature is accepted", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();
    const method = "POST";
    const path = "/api/proposals";
    const bodyHash = "abc123";

    const message = `aegis:v2:${pubkey}:${ts}:${nonce}:${method}:${path}:${bodyHash}`;
    const sig = signMessage(message, kp.secretKey);

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
      "x-solana-method": method,
      "x-solana-path": path,
      "x-solana-body-hash": bodyHash,
    }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.publicKey).toBe(pubkey);
  });

  test("altered body hash invalidates signature", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    const message = `aegis:v2:${pubkey}:${ts}:${nonce}:POST:/api/proposals:correct-hash`;
    const sig = signMessage(message, kp.secretKey);

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
      "x-solana-method": "POST",
      "x-solana-path": "/api/proposals",
      "x-solana-body-hash": "different-hash",
    }));
    expect(result.ok).toBe(false);
  });

  test("altered method invalidates signature", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    const message = `aegis:v2:${pubkey}:${ts}:${nonce}:GET:/api/vaults:-`;
    const sig = signMessage(message, kp.secretKey);

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
      "x-solana-method": "POST", // tampered
      "x-solana-path": "/api/vaults",
      "x-solana-body-hash": "-",
    }));
    expect(result.ok).toBe(false);
  });

  test("altered path invalidates signature", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    const message = `aegis:v2:${pubkey}:${ts}:${nonce}:POST:/api/proposals:-`;
    const sig = signMessage(message, kp.secretKey);

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
      "x-solana-method": "POST",
      "x-solana-path": "/api/stealth", // tampered
      "x-solana-body-hash": "-",
    }));
    expect(result.ok).toBe(false);
  });

  test("expired timestamp is rejected", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs() - 400); // 400s ago — past 5-min window
    const nonce = crypto.randomUUID();

    const message = `aegis:v2:${pubkey}:${ts}:${nonce}:GET:/api/vaults:-`;
    const sig = signMessage(message, kp.secretKey);

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
      "x-solana-method": "GET",
      "x-solana-path": "/api/vaults",
      "x-solana-body-hash": "-",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  test("query string is part of the signed path (sig with ?foo=1 differs from path without query)", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    // Signed for /api/payrolls/X/Y (no query)
    const message = `aegis:v2:${pubkey}:${ts}:${nonce}:GET:/api/payrolls/X/Y:-`;
    const sig = signMessage(message, kp.secretKey);

    // Attacker tries to add ?includeSensitive=true to the path header
    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
      "x-solana-method": "GET",
      "x-solana-path": "/api/payrolls/X/Y?includeSensitive=true",
      "x-solana-body-hash": "-",
    }));
    expect(result.ok).toBe(false);
  });

  test("trailing slash in path is normalized (same sig as without slash)", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    // Client signs without trailing slash
    const message = `aegis:v2:${pubkey}:${ts}:${nonce}:GET:/api/vaults:-`;
    const sig = signMessage(message, kp.secretKey);

    // Server receives path with trailing slash
    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
      "x-solana-method": "GET",
      "x-solana-path": "/api/vaults/", // trailing slash stripped by server
      "x-solana-body-hash": "-",
    }));
    expect(result.ok).toBe(true);
  });

  test("path with trailing slash before query is normalized", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    // Client signs with no trailing slash + query
    const message = `aegis:v2:${pubkey}:${ts}:${nonce}:GET:/api/vaults?x=1:-`;
    const sig = signMessage(message, kp.secretKey);

    // Server receives path with trailing slash + same query
    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
      "x-solana-method": "GET",
      "x-solana-path": "/api/vaults/?x=1",
      "x-solana-body-hash": "-",
    }));
    expect(result.ok).toBe(true);
  });
});

describe("v1 legacy signature", () => {
  test("v1 is accepted when ALLOW_LEGACY_AUTH=true", () => {
    process.env.ALLOW_LEGACY_AUTH = "true";
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    const message = `aegis:${pubkey}:${ts}:${nonce}`;
    const sig = signMessage(message, kp.secretKey);

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
    }));
    expect(result.ok).toBe(true);
  });

  test("v1 is rejected when ALLOW_LEGACY_AUTH=false", () => {
    process.env.ALLOW_LEGACY_AUTH = "false";
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    const message = `aegis:${pubkey}:${ts}:${nonce}`;
    const sig = signMessage(message, kp.secretKey);

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  test("default (no env var) allows v1", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());
    const nonce = crypto.randomUUID();

    const message = `aegis:${pubkey}:${ts}:${nonce}`;
    const sig = signMessage(message, kp.secretKey);

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": sig,
      "x-solana-timestamp": ts,
      "x-solana-nonce": nonce,
    }));
    expect(result.ok).toBe(true);
  });
});

describe("malformed requests", () => {
  test("missing required headers → 401", () => {
    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": "SomePubkey",
      // missing signature and timestamp
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  test("invalid pubkey → 401", () => {
    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": "not-a-valid-pubkey",
      "x-solana-signature": "somesig",
      "x-solana-timestamp": String(nowSecs()),
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  test("invalid signature encoding → 401", () => {
    const kp = makeKeypair();
    const pubkey = bs58.encode(kp.publicKey);
    const ts = String(nowSecs());

    const result = verifyWalletAuthHeaders(makeHeaders({
      "x-solana-pubkey": pubkey,
      "x-solana-signature": "!!!not-valid-base58!!!",
      "x-solana-timestamp": ts,
      "x-solana-nonce": "some-nonce",
    }));
    expect(result.ok).toBe(false);
  });
});

"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useRef } from "react";

/**
 * Wallet auth hook — signs each API request with an endpoint-bound Ed25519 signature.
 *
 * Signature format (v2):
 *   aegis:v2:{pubkey}:{ts}:{nonce}:{METHOD}:{/path}:{bodyHash}
 *
 * bodyHash = base64url(sha256(body)) or "-" for requests without a body (GET/HEAD).
 *
 * The signature is per-request (no cross-request cache). Phantom signs silently
 * after the initial wallet connection; other wallets may show a prompt — in that
 * case upgrade to session-key auth (S7) will be introduced.
 *
 * UX guards:
 *   - 60s cooldown after user rejects the sign prompt (prevents spam)
 *   - Concurrent calls for the same URL+method+body are deduplicated
 */

const SIGN_COOLDOWN_MS = 60 * 1000;

async function computeBodyHash(body: BodyInit | null | undefined): Promise<string> {
  if (!body) return "-";
  let bytes: Uint8Array;
  if (typeof body === "string") {
    bytes = new TextEncoder().encode(body);
  } else if (body instanceof Uint8Array) {
    bytes = new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength);
  } else if (body instanceof ArrayBuffer) {
    bytes = new Uint8Array(body);
  } else {
    // FormData, Blob, ReadableStream — treat as opaque; no body hash
    return "-";
  }
  if (bytes.length === 0) return "-";
  // Ensure a plain ArrayBuffer for SubtleCrypto (Uint8Array.buffer may be ArrayBufferLike)
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  const hashBytes = new Uint8Array(hashBuffer);
  // base64url encode
  const binary = String.fromCharCode(...hashBytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function normalizePath(input: string | URL): string {
  const url =
    typeof input === "string"
      ? new URL(input, typeof window !== "undefined" ? window.location.origin : "http://localhost")
      : input;
  const path = url.pathname.replace(/\/$/, "") || "/";
  // Include search/query string in the signed path so a captured signature
  // cannot be replayed against the same path with a different query (e.g.
  // ?includeSensitive=true).
  return path + (url.search || "");
}

export function useWalletAuth() {
  const wallet = useWallet();
  const lastFailureRef = useRef<number>(0);
  // Dedup map: key = "METHOD:path:bodyHash" → in-flight promise
  const pendingRef = useRef<Map<string, Promise<Record<string, string> | null>>>(new Map());

  const signRequest = useCallback(
    async (
      method: string,
      path: string,
      bodyHash: string,
    ): Promise<Record<string, string> | null> => {
      if (!wallet.publicKey || !wallet.signMessage || !wallet.connected) return null;

      if (Date.now() - lastFailureRef.current < SIGN_COOLDOWN_MS) return null;

      const pubKeyB58 = wallet.publicKey.toBase58();
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomUUID();
      const normalizedMethod = method.toUpperCase();
      const normalizedPath = path.replace(/\/$/, "") || "/";

      const message = `aegis:v2:${pubKeyB58}:${timestamp}:${nonce}:${normalizedMethod}:${normalizedPath}:${bodyHash}`;
      const messageBytes = new TextEncoder().encode(message);

      let signature: Uint8Array;
      try {
        signature = await wallet.signMessage(messageBytes);
      } catch {
        lastFailureRef.current = Date.now();
        return null;
      }

      const { default: bs58 } = await import("bs58");
      const signatureB58 = bs58.encode(signature);

      return {
        "x-solana-pubkey": pubKeyB58,
        "x-solana-signature": signatureB58,
        "x-solana-timestamp": String(timestamp),
        "x-solana-nonce": nonce,
        "x-solana-method": normalizedMethod,
        "x-solana-path": normalizedPath,
        "x-solana-body-hash": bodyHash,
      };
    },
    [wallet.publicKey, wallet.signMessage, wallet.connected],
  );

  /** Authenticated fetch — computes bodyHash and signs each request. */
  const fetchWithAuth = useCallback(
    async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const method = (init?.method ?? "GET").toUpperCase();
      const path = normalizePath(input);
      const bodyHash = await computeBodyHash(init?.body);
      const dedupeKey = `${method}:${path}:${bodyHash}`;

      // Dedup: if the same (method+path+body) is being signed concurrently, reuse
      const pending = pendingRef.current.get(dedupeKey);
      let authHeadersPromise: Promise<Record<string, string> | null>;
      if (pending) {
        authHeadersPromise = pending;
      } else {
        authHeadersPromise = signRequest(method, path, bodyHash);
        pendingRef.current.set(dedupeKey, authHeadersPromise);
        authHeadersPromise.finally(() => pendingRef.current.delete(dedupeKey));
      }

      const authHeaders = await authHeadersPromise;

      const mergedHeaders: Record<string, string> = {
        ...(init?.headers as Record<string, string> | undefined),
      };
      if (authHeaders) {
        Object.assign(mergedHeaders, authHeaders);
      }

      return fetch(input, {
        ...init,
        headers: mergedHeaders,
      });
    },
    [signRequest],
  );

  /**
   * Legacy: returns headers for the NEXT request without a body.
   * Prefer fetchWithAuth for full endpoint binding.
   */
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    return signRequest("GET", "/", "-");
  }, [signRequest]);

  return { fetchWithAuth, getAuthHeaders };
}

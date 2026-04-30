"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useRef } from "react";

const AUTH_STORAGE_KEY = "aegis-wallet-auth";
const AUTH_TTL_SECS = 4 * 60; // re-sign every 4 min (server allows 5)
const SIGN_COOLDOWN_MS = 60 * 1000; // wait 60s after a failed sign attempt

type StoredAuth = {
  publicKey: string;
  signature: string; // base58
  timestamp: number; // unix seconds
};

/**
 * Hook that provides an authenticated fetch wrapper.
 * Automatically signs an auth message with the connected wallet
 * and attaches the signature to outgoing API requests.
 *
 * Guards against race conditions and spam:
 *   - Deduplicates concurrent signMessage calls (single in-flight Promise)
 *   - Backs off for 60s after a rejection/wallet error
 *   - Only attempts signing when wallet.connected is true
 */
export function useWalletAuth() {
  const wallet = useWallet();
  const cachedRef = useRef<StoredAuth | null>(null);
  const signingPromiseRef = useRef<Promise<Record<string, string> | null> | null>(null);
  const lastFailureRef = useRef<number>(0);

  /** Get or create a valid auth token, signing with wallet if needed. */
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    if (!wallet.publicKey || !wallet.signMessage || !wallet.connected) return null;

    const pubKeyB58 = wallet.publicKey.toBase58();
    const now = Math.floor(Date.now() / 1000);

    // Check cache + localStorage for a still-valid token
    if (cachedRef.current && cachedRef.current.publicKey === pubKeyB58) {
      if (now - cachedRef.current.timestamp < AUTH_TTL_SECS) {
        return {
          "x-solana-pubkey": cachedRef.current.publicKey,
          "x-solana-signature": cachedRef.current.signature,
          "x-solana-timestamp": String(cachedRef.current.timestamp),
        };
      }
    }

    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed: StoredAuth = JSON.parse(stored);
        if (parsed.publicKey === pubKeyB58 && now - parsed.timestamp < AUTH_TTL_SECS) {
          cachedRef.current = parsed;
          return {
            "x-solana-pubkey": parsed.publicKey,
            "x-solana-signature": parsed.signature,
            "x-solana-timestamp": String(parsed.timestamp),
          };
        }
      }
    } catch {
      // ignore parse errors
    }

    // Cooldown after failure — prevents spam when user rejects or wallet is busy
    if (Date.now() - lastFailureRef.current < SIGN_COOLDOWN_MS) {
      return null;
    }

    // Deduplicate: if another call is already signing, wait for it
    if (signingPromiseRef.current) {
      return signingPromiseRef.current;
    }

    const timestamp = now;
    const message = `aegis:${pubKeyB58}:${timestamp}`;
    const messageBytes = new TextEncoder().encode(message);

    const signPromise = (async (): Promise<Record<string, string> | null> => {
      if (!wallet.signMessage) return null;
      let signature: Uint8Array;
      try {
        signature = await wallet.signMessage(messageBytes);
      } catch {
        lastFailureRef.current = Date.now();
        return null;
      }

      const bs58Module = await import("bs58");
      const signatureB58 = bs58Module.default.encode(signature);

      const auth: StoredAuth = {
        publicKey: pubKeyB58,
        signature: signatureB58,
        timestamp,
      };

      cachedRef.current = auth;
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
      } catch {
        // ignore storage errors
      }

      return {
        "x-solana-pubkey": auth.publicKey,
        "x-solana-signature": auth.signature,
        "x-solana-timestamp": String(auth.timestamp),
      };
    })();

    signingPromiseRef.current = signPromise;
    try {
      const result = await signPromise;
      return result;
    } finally {
      signingPromiseRef.current = null;
    }
  }, [wallet.publicKey, wallet.signMessage, wallet.connected]);

  /** Authenticated fetch — adds wallet signature headers automatically. */
  const fetchWithAuth = useCallback(
    async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const authHeaders = await getAuthHeaders();

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
    [getAuthHeaders],
  );

  return { fetchWithAuth, getAuthHeaders };
}

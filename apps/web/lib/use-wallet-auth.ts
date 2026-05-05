"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useRef } from "react";

/**
 * Wallet auth hook — session-cookie based.
 *
 * On the first authenticated request after connecting (or on session expiry),
 * the user signs ONE `aegis:session:` message with their wallet. The server
 * (`/api/auth/login`) verifies it and sets an httpOnly `aegis-session` cookie
 * valid for ~30 minutes. All subsequent `fetchWithAuth` calls send the cookie
 * automatically — no further wallet popups.
 *
 * On 401 (e.g., server restart, secret rotation), the session is cleared and a
 * fresh sign-in is attempted exactly once before bubbling the error.
 *
 * UX guards:
 *   - 60s cooldown after the user rejects the sign prompt (prevents spam).
 *   - Concurrent calls share a single in-flight login promise.
 */

const SIGN_COOLDOWN_MS = 60 * 1000;
const SESSION_REFRESH_BEFORE_MS = 60 * 1000; // re-login if <1m of session left
const SESSION_STORAGE_KEY = "aegis:wallet-session";

type SessionInfo = { publicKey: string; expiresAt: number };

function loadSession(): SessionInfo | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionInfo;
    if (
      typeof parsed?.publicKey !== "string" ||
      typeof parsed?.expiresAt !== "number" ||
      Date.now() + SESSION_REFRESH_BEFORE_MS >= parsed.expiresAt
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(info: SessionInfo) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(info));
  } catch {
    /* ignore quota / disabled storage */
  }
}

function clearSession() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useWalletAuth() {
  const wallet = useWallet();
  const sessionPromiseRef = useRef<Promise<SessionInfo | null> | null>(null);
  const lastFailureRef = useRef<number>(0);

  const ensureSession = useCallback(async (): Promise<SessionInfo | null> => {
    if (!wallet.publicKey || !wallet.signMessage || !wallet.connected) return null;

    const pubkey = wallet.publicKey.toBase58();

    const current = loadSession();
    if (current && current.publicKey === pubkey) return current;

    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    if (Date.now() - lastFailureRef.current < SIGN_COOLDOWN_MS) return null;

    const promise = (async (): Promise<SessionInfo | null> => {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomUUID();
      const message = `aegis:session:${pubkey}:${timestamp}:${nonce}`;

      const signMessage = wallet.signMessage;
      if (!signMessage) return null;
      let signature: Uint8Array;
      try {
        signature = await signMessage(new TextEncoder().encode(message));
      } catch {
        lastFailureRef.current = Date.now();
        return null;
      }

      const { default: bs58 } = await import("bs58");
      const signatureB58 = bs58.encode(signature);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: pubkey, signature: signatureB58, timestamp, nonce }),
        credentials: "include",
      });

      if (!res.ok) {
        lastFailureRef.current = Date.now();
        return null;
      }

      const json = (await res.json().catch(() => null)) as { expiresAt?: number } | null;
      const expiresAt =
        typeof json?.expiresAt === "number" ? json.expiresAt : Date.now() + 30 * 60 * 1000;
      const info: SessionInfo = { publicKey: pubkey, expiresAt };
      saveSession(info);
      return info;
    })();

    sessionPromiseRef.current = promise;
    promise.finally(() => {
      sessionPromiseRef.current = null;
    });
    return promise;
  }, [wallet.publicKey, wallet.signMessage, wallet.connected]);

  /** Authenticated fetch — relies on the session cookie set by /api/auth/login. */
  const fetchWithAuth = useCallback(
    async (input: string | URL, init?: RequestInit): Promise<Response> => {
      // Establish/refresh session if needed before firing the request.
      // If the user rejects the sign prompt, we still attempt the request — the
      // server will return 401 which the caller can surface to the user.
      await ensureSession();

      const doFetch = () =>
        fetch(input, {
          ...init,
          credentials: "include",
        });

      let res = await doFetch();

      // Session may have been invalidated server-side (restart, secret rotation,
      // cookie cleared). Try one more time with a fresh sign-in.
      if (res.status === 401 && wallet.connected) {
        clearSession();
        const fresh = await ensureSession();
        if (fresh) res = await doFetch();
      }

      return res;
    },
    [ensureSession, wallet.connected],
  );

  // Clear stored session when wallet disconnects or switches accounts.
  useEffect(() => {
    if (!wallet.connected) {
      clearSession();
      // Best-effort cookie clear; ignore errors if endpoint is offline.
      void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
      return;
    }
    const stored = loadSession();
    const current = wallet.publicKey?.toBase58();
    if (stored && current && stored.publicKey !== current) {
      clearSession();
    }
  }, [wallet.connected, wallet.publicKey]);

  /**
   * Backwards-compat shim. Previously returned signed v2 headers; with session
   * cookies, headers are not needed — the cookie is attached automatically.
   * Returning an empty header map keeps existing callers working.
   */
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const session = await ensureSession();
    return session ? {} : null;
  }, [ensureSession]);

  return { fetchWithAuth, getAuthHeaders };
}

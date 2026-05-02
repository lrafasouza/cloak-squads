"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export type AegisVault = {
  id: string;
  cofreAddress: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type MyVaultsState = {
  vaults: AegisVault[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  search: () => void;
};

type Cached = { publicKey: string; vaults: AegisVault[]; ts: number };

const CACHE_KEY = "aegis:my-vaults";
const TTL_WITH_VAULTS = 10 * 60 * 1000;
const TTL_EMPTY = 3 * 60 * 1000;

function makePlaceholder(addr: string): AegisVault {
  return {
    id: `onchain-${addr}`,
    cofreAddress: addr,
    name: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function readCache(pubKey: string): AegisVault[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c: Cached = JSON.parse(raw);
    if (c.publicKey !== pubKey) return null;
    const ttl = c.vaults.length > 0 ? TTL_WITH_VAULTS : TTL_EMPTY;
    if (Date.now() - c.ts > ttl) return null;
    return c.vaults;
  } catch {
    return null;
  }
}

function writeCache(pubKey: string, vaults: AegisVault[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ publicKey: pubKey, vaults, ts: Date.now() } satisfies Cached),
    );
  } catch {
    /* ignore */
  }
}

const MyVaultsContext = createContext<MyVaultsState | null>(null);

export function MyVaultsProvider({ children }: { children: ReactNode }) {
  const [vaults, setVaults] = useState<AegisVault[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { publicKey } = useWallet();
  const scanningRef = useRef(false);
  const prevPubKeyRef = useRef<string | null>(null);

  const doScan = useCallback(async (owner: string) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const mineRes = await fetch(`/api/vaults/mine?owner=${encodeURIComponent(owner)}`);
      const mineData: { vaults?: string[]; error?: string } = await mineRes.json();

      if (mineData.error) {
        setError(mineData.error);
        return;
      }

      const addresses: string[] = mineData.vaults ?? [];

      if (addresses.length === 0) {
        setVaults([]);
        writeCache(owner, []);
        return;
      }

      const dbRes = await fetch(`/api/vaults?addresses=${encodeURIComponent(addresses.join(","))}`);
      const dbData: { vaults?: AegisVault[]; error?: string } = await dbRes.json();

      const dbMap = new Map((dbData.vaults ?? []).map((v) => [v.cofreAddress, v]));

      const merged: AegisVault[] = addresses.map(
        (addr) => dbMap.get(addr) ?? makePlaceholder(addr),
      );

      setVaults(merged);
      writeCache(owner, merged);
      setError(null);
    } catch {
      setError("Could not reach the network");
    } finally {
      setLoading(false);
      setLoaded(true);
      scanningRef.current = false;
    }
  }, []);

  const search = useCallback(() => {
    if (!publicKey) return;
    const owner = publicKey.toBase58();

    const cached = readCache(owner);
    if (cached !== null) {
      setVaults(cached);
      setLoaded(true);
      setLoading(false);
      setError(null);
      return;
    }

    doScan(owner);
  }, [publicKey, doScan]);

  useEffect(() => {
    const pubKeyB58 = publicKey?.toBase58() ?? null;

    if (pubKeyB58 === prevPubKeyRef.current) return;
    prevPubKeyRef.current = pubKeyB58;

    if (!pubKeyB58) {
      setVaults([]);
      setLoaded(false);
      setError(null);
      setLoading(false);
      return;
    }

    const cached = readCache(pubKeyB58);
    if (cached !== null) {
      setVaults(cached);
      setLoaded(true);
      setLoading(false);
      setError(null);
    } else {
      doScan(pubKeyB58);
    }
  }, [publicKey, doScan]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== CACHE_KEY || !e.newValue) return;
      const pubKeyB58 = publicKey?.toBase58();
      if (!pubKeyB58) return;
      try {
        const c: Cached = JSON.parse(e.newValue);
        if (c.publicKey === pubKeyB58) {
          setVaults(c.vaults);
          setLoaded(true);
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [publicKey]);

  return (
    <MyVaultsContext.Provider value={{ vaults, loading, loaded, error, search }}>
      {children}
    </MyVaultsContext.Provider>
  );
}

export function useMyVaults(): MyVaultsState {
  const ctx = useContext(MyVaultsContext);
  if (!ctx) throw new Error("useMyVaults must be used within MyVaultsProvider");
  return ctx;
}

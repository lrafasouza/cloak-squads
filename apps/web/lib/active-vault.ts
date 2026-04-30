"use client";

import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

const ACTIVE_VAULT_STORAGE_KEY = "aegis-active-vault";
const ACTIVE_VAULT_EVENT = "aegis-active-vault-change";

function normalizeVaultAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

export function setActiveVaultAddress(value: string) {
  const normalized = normalizeVaultAddress(value);
  if (!normalized) throw new Error("Invalid Solana address");
  window.localStorage.setItem(ACTIVE_VAULT_STORAGE_KEY, normalized);
  window.dispatchEvent(new CustomEvent(ACTIVE_VAULT_EVENT, { detail: normalized }));
  return normalized;
}

export function getActiveVaultAddress() {
  if (typeof window === "undefined") return null;
  return normalizeVaultAddress(window.localStorage.getItem(ACTIVE_VAULT_STORAGE_KEY));
}

export function useActiveVaultAddress() {
  const [activeVault, setActiveVault] = useState<string | null>(null);

  useEffect(() => {
    setActiveVault(getActiveVaultAddress());

    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_VAULT_STORAGE_KEY) {
        setActiveVault(normalizeVaultAddress(event.newValue));
      }
    };
    const onActiveVaultChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      setActiveVault(normalizeVaultAddress(detail));
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ACTIVE_VAULT_EVENT, onActiveVaultChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACTIVE_VAULT_EVENT, onActiveVaultChange);
    };
  }, []);

  const setActiveVaultAddressSafe = useCallback((value: string) => {
    const normalized = setActiveVaultAddress(value);
    setActiveVault(normalized);
    return normalized;
  }, []);

  return { activeVault, setActiveVaultAddress: setActiveVaultAddressSafe };
}

"use client";

const PREFIX = "cloak-squads";

function keyFor(multisig: string, label: string) {
  return `${PREFIX}:${multisig}:${label}`;
}

function getSessionStorage(): Storage | null {
  // More robust check for browser environment
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export type CachedViewKey = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  savedAt: number;
};

export function saveSignerViewKey(multisig: string, value: CachedViewKey) {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(
    keyFor(multisig, "signer-view-key"),
    JSON.stringify({
      publicKey: bytesToBase64(value.publicKey),
      secretKey: bytesToBase64(value.secretKey),
      savedAt: value.savedAt,
    }),
  );
}

export function loadSignerViewKey(multisig: string): CachedViewKey | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(keyFor(multisig, "signer-view-key"));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { publicKey: string; secretKey: string; savedAt: number };
    return {
      publicKey: base64ToBytes(parsed.publicKey),
      secretKey: base64ToBytes(parsed.secretKey),
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearSignerViewKey(multisig: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(keyFor(multisig, "signer-view-key"));
}

"use client";

const PREFIX = "cloak-squads";

function keyFor(multisig: string, label: string) {
  return `${PREFIX}:${multisig}:${label}`;
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
  sessionStorage.setItem(
    keyFor(multisig, "signer-view-key"),
    JSON.stringify({
      publicKey: bytesToBase64(value.publicKey),
      secretKey: bytesToBase64(value.secretKey),
      savedAt: value.savedAt,
    }),
  );
}

export function loadSignerViewKey(multisig: string): CachedViewKey | null {
  const raw = sessionStorage.getItem(keyFor(multisig, "signer-view-key"));
  if (!raw) return null;

  const parsed = JSON.parse(raw) as { publicKey: string; secretKey: string; savedAt: number };
  return {
    publicKey: base64ToBytes(parsed.publicKey),
    secretKey: base64ToBytes(parsed.secretKey),
    savedAt: parsed.savedAt,
  };
}

export function clearSignerViewKey(multisig: string) {
  sessionStorage.removeItem(keyFor(multisig, "signer-view-key"));
}

export function saveProposalDraft<T>(multisig: string, transactionIndex: string, draft: T) {
  sessionStorage.setItem(keyFor(multisig, `proposal:${transactionIndex}`), JSON.stringify(draft));
}

export function loadProposalDraft<T>(multisig: string, transactionIndex: string): T | null {
  const raw = sessionStorage.getItem(keyFor(multisig, `proposal:${transactionIndex}`));
  return raw ? (JSON.parse(raw) as T) : null;
}

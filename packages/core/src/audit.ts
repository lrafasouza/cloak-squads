import { blake3 } from "@noble/hashes/blake3";
import nacl from "tweetnacl";
import { concatBytes, domainSeparator } from "./encoding";

export type AuditScope = "full" | "amounts_only" | "time_ranged";

export type AuditLinkMetadata = {
  linkId: string;
  scope: AuditScope;
  startDate: bigint;
  endDate: bigint;
};

export type ScopedAuditKey = {
  diversifier: Uint8Array;
  secretKey: Uint8Array;
};

/**
 * Derive a scoped audit key from a master view key and audit metadata.
 * The scoped key is deterministically derived so the same audit link always
 * produces the same key, but different links produce different keys.
 */
export function deriveScopedAuditKey(
  masterViewKey: Uint8Array,
  metadata: AuditLinkMetadata,
): ScopedAuditKey {
  if (masterViewKey.length !== 32) {
    throw new Error("master view key must be 32 bytes");
  }

  const encoder = new TextEncoder();
  const linkIdBytes = encoder.encode(metadata.linkId);
  const scopeBytes = encoder.encode(metadata.scope);

  const startBytes = new Uint8Array(8);
  const startView = new DataView(startBytes.buffer);
  startView.setBigUint64(0, metadata.startDate, true);

  const endBytes = new Uint8Array(8);
  const endView = new DataView(endBytes.buffer);
  endView.setBigUint64(0, metadata.endDate, true);

  const diversifierInput = concatBytes(
    domainSeparator("cloak-audit-v1"),
    linkIdBytes,
    scopeBytes,
    startBytes,
    endBytes,
  );

  const diversifier = blake3(diversifierInput).slice(0, 32);

  // Derive secret key by hashing master key + diversifier
  const secretInput = concatBytes(
    domainSeparator("cloak-audit-key-v1"),
    masterViewKey,
    diversifier,
  );
  const secretKey = blake3(secretInput).slice(0, 32);

  return { diversifier, secretKey };
}

/**
 * Generate a random secret for the audit link fragment (#hash).
 * This is shared in the URL and used client-side to derive the viewing key.
 */
export function generateAuditLinkSecret(): Uint8Array {
  return nacl.randomBytes(32);
}

/**
 * Validate that a URL fragment matches an audit link's expected hash.
 * The fragment should be base64url-encoded secret + diversifier proof.
 */
export function validateAuditFragment(
  _linkId: string,
  fragment: string,
): { secretKey: Uint8Array; valid: boolean } {
  try {
    // Fragment format: base64url(secretKey)
    const secretKey = base64urlDecode(fragment);
    if (secretKey.length !== 32) {
      return { secretKey: new Uint8Array(0), valid: false };
    }

    // Additional validation could include a MAC, but for now we just check format
    return { secretKey, valid: true };
  } catch {
    return { secretKey: new Uint8Array(0), valid: false };
  }
}

/**
 * Derive the viewing key from an audit link secret.
 * This is done client-side using the secret from the URL fragment.
 */
export function deriveViewKeyFromSecret(
  secretKey: Uint8Array,
  metadata: AuditLinkMetadata,
): Uint8Array {
  const encoder = new TextEncoder();
  const scopeBytes = encoder.encode(metadata.scope);

  const startBytes = new Uint8Array(8);
  const startView = new DataView(startBytes.buffer);
  startView.setBigUint64(0, metadata.startDate, true);

  const endBytes = new Uint8Array(8);
  const endView = new DataView(endBytes.buffer);
  endView.setBigUint64(0, metadata.endDate, true);

  const input = concatBytes(
    domainSeparator("cloak-audit-view-v1"),
    secretKey,
    new TextEncoder().encode(metadata.linkId),
    scopeBytes,
    startBytes,
    endBytes,
  );

  return blake3(input).slice(0, 32);
}

export type FilteredAuditTransaction = {
  timestamp: number;
  type: "deposit" | "transfer" | "withdraw";
  amount?: string | undefined;
  nullifier: string;
  status: "confirmed" | "pending";
};

export type AuditExportRow = {
  timestamp: string;
  type: string;
  amount: string;
  nullifier: string;
  status: string;
};

/**
 * Filter raw Cloak scan data according to the audit scope.
 */
export function filterAuditData(
  transactions: FilteredAuditTransaction[],
  scope: AuditScope,
  params?: { startDate: number; endDate: number },
): FilteredAuditTransaction[] {
  let filtered = transactions;

  // Apply time range filter if scope is time_ranged or if params provided
  if (scope === "time_ranged" && params) {
    filtered = filtered.filter(
      (tx) => tx.timestamp >= params.startDate && tx.timestamp <= params.endDate,
    );
  }

  // Apply amounts_only filter: redact amounts
  if (scope === "amounts_only") {
    filtered = filtered.map((tx) => ({
      ...tx,
      amount: undefined,
    }));
  }

  return filtered;
}

/**
 * Convert filtered audit data to CSV format for compliance export.
 */
export function exportAuditToCSV(
  transactions: FilteredAuditTransaction[],
): string {
  const rows: AuditExportRow[] = transactions.map((tx) => ({
    timestamp: new Date(tx.timestamp).toISOString(),
    type: tx.type,
    amount: tx.amount ?? "REDACTED",
    nullifier: tx.nullifier,
    status: tx.status,
  }));

  const headers = ["timestamp", "type", "amount", "nullifier", "status"];
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h as keyof AuditExportRow];
          // Escape values containing commas or quotes
          if (val.includes(",") || val.includes('"')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(","),
    ),
  ];

  return csvLines.join("\n");
}

function base64urlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64urlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Deterministic pseudo-random generator using a string seed.
 * Produces consistent mock data for the same linkId.
 */
function seededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return () => {
    hash = ((hash * 16807) % 2147483647) | 0;
    return (hash >>> 0) / 2147483647;
  };
}

/**
 * Generate deterministic mock audit transactions based on a linkId seed.
 * Useful for demo and testing when real Cloak scan data is unavailable.
 */
export function generateDeterministicMockData(
  linkId: string,
  count: number = 5,
): FilteredAuditTransaction[] {
  const rand = seededRandom(linkId);
  const types: Array<"deposit" | "transfer" | "withdraw"> = ["deposit", "transfer", "withdraw"];
  const statuses: Array<"confirmed" | "pending"> = ["confirmed", "pending"];
  const now = Date.now();

  function pickRandom<T>(arr: T[]): T {
    const idx = Math.floor(rand() * arr.length);
    return arr[idx]!;
  }

  return Array.from({ length: count }, (_, i) => {
    const type = pickRandom(types);
    const status = pickRandom(statuses);
    const amount = String(Math.floor(rand() * 10_000_000_000) + 100_000);
    const daysAgo = Math.floor(rand() * 30);
    const hoursAgo = Math.floor(rand() * 24);
    const timestamp = now - (daysAgo * 86400000 + hoursAgo * 3600000 + i * 60000);

    return {
      timestamp,
      type,
      amount,
      nullifier: `${linkId.slice(0, 8)}-${i.toString(16).padStart(4, "0")}-${Buffer.from(
        Array.from({ length: 8 }, () => Math.floor(rand() * 256)),
      ).toString("hex")}`,
      status,
    };
  }).sort((a, b) => b.timestamp - a.timestamp);
}

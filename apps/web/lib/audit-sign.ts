import { createHash } from "node:crypto";
import nacl from "tweetnacl";

/**
 * Resolve the Ed25519 keypair used to sign audit exports.
 *
 * Reads `AUDIT_EXPORT_SIGN_KEY` from the environment. To avoid the
 * ambiguous-parse class of bug (Pass 2 audit F-103), the value MUST carry
 * an explicit scheme prefix:
 *
 *   - `base64:<44 chars>` — strict 32-byte base64 seed (preferred).
 *     Generate with:
 *       node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
 *
 *   - `passphrase:<any string ≥16 chars>` — SHA-256 hashed into a
 *     deterministic 32-byte seed. Devnet-friendly fallback; cryptographic
 *     entropy is whatever the passphrase carries, so production should
 *     prefer `base64:`.
 *
 * No prefix → boot fails with a clear message. This rules out the
 * 43-/44-char passphrase that accidentally decodes as base64.
 *
 * Each export envelope embeds the verifying `publicKey`, so rotating only
 * impacts NEW exports — historical exports remain offline-verifiable
 * against the snapshot pubkey.
 */
let cached: nacl.SignKeyPair | null = null;

// Strict base64: only valid base64 alphabet chars, optional 0-2 `=` padding.
// 32-byte seed encodes to exactly 44 chars (43 + 1 `=`).
const STRICT_BASE64_32B = /^[A-Za-z0-9+/]{43}=$/;

function decodeStrictBase64Seed(value: string): Uint8Array {
  if (!STRICT_BASE64_32B.test(value)) {
    throw new Error(
      "AUDIT_EXPORT_SIGN_KEY: 'base64:' prefix requires exactly 44 base64 chars " +
        "(32-byte seed). Generate: " +
        `node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  const decoded = Uint8Array.from(Buffer.from(value, "base64"));
  if (decoded.length !== 32) {
    // Should be unreachable given the regex above; defensive guard for
    // future-proofing if the regex is relaxed.
    throw new Error("AUDIT_EXPORT_SIGN_KEY: base64 seed must decode to 32 bytes.");
  }
  return decoded;
}

export function getAuditSigningKeypair(): nacl.SignKeyPair {
  if (cached) return cached;

  const explicit = process.env.AUDIT_EXPORT_SIGN_KEY;
  if (!explicit) {
    throw new Error("AUDIT_EXPORT_SIGN_KEY must be set.");
  }

  // Strict prefix dispatch — see header comment.
  if (explicit.startsWith("base64:")) {
    const seed = decodeStrictBase64Seed(explicit.slice("base64:".length));
    cached = nacl.sign.keyPair.fromSeed(seed);
    return cached;
  }

  if (explicit.startsWith("passphrase:")) {
    const passphrase = explicit.slice("passphrase:".length);
    if (passphrase.length < 16) {
      throw new Error(
        "AUDIT_EXPORT_SIGN_KEY: 'passphrase:' requires at least 16 chars of entropy.",
      );
    }
    const seed = createHash("sha256").update(`audit-export-v1:${passphrase}`).digest();
    cached = nacl.sign.keyPair.fromSeed(Uint8Array.from(seed));
    return cached;
  }

  throw new Error(
    "AUDIT_EXPORT_SIGN_KEY must carry an explicit scheme prefix " +
      "('base64:<44-char seed>' or 'passphrase:<>=16 chars>'). " +
      "Bare values are rejected to prevent ambiguous parsing (audit Pass 2 F-103). " +
      "Generate a fresh base64 seed: " +
      `node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"`,
  );
}

/**
 * Test-only: reset the cached keypair so a test can swap
 * AUDIT_EXPORT_SIGN_KEY between cases. Production must not call this.
 */
export function __resetAuditSigningKeypairForTests(): void {
  cached = null;
}

export type SignedAuditExport = {
  data: string;
  signature: string;
  publicKey: string;
  signedAt: string;
  vault: string;
  linkId: string;
  contentType: string;
};

/**
 * Build the canonical message bytes covered by the export signature.
 *
 * Pipe-delimited concatenation is NOT injective — `vault="a|b"` + `linkId="c"`
 * collides with `vault="a"` + `linkId="b|c"`. We avoid that by length-prefixing
 * each component (4-byte big-endian) so each field's start/end is unambiguous,
 * and we hash the data payload before binding so the message size stays small
 * regardless of export size.
 *
 * Layout:
 *   "aegis-audit-export-v1\0"
 *   len(signedAt)    || signedAt
 *   len(vault)       || vault
 *   len(linkId)      || linkId
 *   len(contentType) || contentType
 *   sha256(data)     (32 bytes, fixed)
 */
const SIGN_DOMAIN_SEP = "aegis-audit-export-v1\0";

function lengthPrefixed(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, false);
  out.set(bytes, 4);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function buildAuditExportMessage(args: {
  signedAt: string;
  vault: string;
  linkId: string;
  contentType: string;
  data: string;
}): Uint8Array {
  const dataHash = Uint8Array.from(createHash("sha256").update(args.data).digest());
  return concatBytes(
    new TextEncoder().encode(SIGN_DOMAIN_SEP),
    lengthPrefixed(args.signedAt),
    lengthPrefixed(args.vault),
    lengthPrefixed(args.linkId),
    lengthPrefixed(args.contentType),
    dataHash,
  );
}

/**
 * Sign an export payload. The signature binds the data to a specific link with
 * a domain separator and length-prefixed fields so external verifiers can
 * reproduce the message bytes deterministically.
 */
export function signAuditExport(args: {
  vault: string;
  linkId: string;
  contentType: "text/csv" | "application/json";
  data: string;
}): SignedAuditExport {
  const kp = getAuditSigningKeypair();
  const signedAt = new Date().toISOString();
  const message = buildAuditExportMessage({
    signedAt,
    vault: args.vault,
    linkId: args.linkId,
    contentType: args.contentType,
    data: args.data,
  });
  const signature = nacl.sign.detached(message, kp.secretKey);
  return {
    data: args.data,
    signature: Buffer.from(signature).toString("base64"),
    publicKey: Buffer.from(kp.publicKey).toString("base64"),
    signedAt,
    vault: args.vault,
    linkId: args.linkId,
    contentType: args.contentType,
  };
}

import nacl from "tweetnacl";

/**
 * Resolve the Ed25519 keypair used to sign audit exports.
 *
 * Reads `AUDIT_EXPORT_SIGN_KEY` from the environment. The value is either
 * a base64-encoded 32-byte seed (preferred — generate with
 * `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
 * or any string ≥1 char which is hashed with SHA-256 to derive a deterministic
 * 32-byte seed (acceptable for devnet so a Render-generated random string
 * works without manual processing).
 *
 * Each export envelope embeds the verifying `publicKey`, so rotating only
 * impacts NEW exports — historical exports remain offline-verifiable
 * against the snapshot pubkey.
 */
let cached: nacl.SignKeyPair | null = null;

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

export function getAuditSigningKeypair(): nacl.SignKeyPair {
  if (cached) return cached;

  const explicit = process.env.AUDIT_EXPORT_SIGN_KEY;
  if (!explicit) {
    throw new Error("AUDIT_EXPORT_SIGN_KEY must be set.");
  }

  // Preferred path: literal 32-byte base64 seed.
  const decoded = decodeBase64(explicit);
  if (decoded.length === 32) {
    cached = nacl.sign.keyPair.fromSeed(decoded);
    return cached;
  }

  // Fallback path: hash any non-empty string into a deterministic seed so
  // a Render-generated random hex/string still works without manual
  // base64 encoding. Devnet-friendly; production should set a real
  // 32-byte seed for cryptographic hygiene.
  if (explicit.length < 1) {
    throw new Error("AUDIT_EXPORT_SIGN_KEY must be non-empty.");
  }
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const seed = createHash("sha256").update(`audit-export-v1:${explicit}`).digest();
  cached = nacl.sign.keyPair.fromSeed(Uint8Array.from(seed));
  return cached;
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
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
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

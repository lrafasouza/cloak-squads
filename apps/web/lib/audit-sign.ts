import nacl from "tweetnacl";

/**
 * Resolve the Ed25519 keypair used to sign audit exports. The key is read from
 * the `AUDIT_EXPORT_SIGN_KEY` env var (base64 of a 32-byte seed). If unset, we
 * derive a stable per-process key from `JWT_SIGNING_SECRET` so devnet still
 * produces verifiable signatures — but operators should set the env in prod
 * so signatures survive deploys.
 */
let cached: nacl.SignKeyPair | null = null;

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

export function getAuditSigningKeypair(): nacl.SignKeyPair {
  if (cached) return cached;

  const explicit = process.env.AUDIT_EXPORT_SIGN_KEY;
  if (explicit) {
    const seed = decodeBase64(explicit);
    if (seed.length !== 32) {
      throw new Error("AUDIT_EXPORT_SIGN_KEY must decode to 32 bytes (base64-encoded seed).");
    }
    cached = nacl.sign.keyPair.fromSeed(seed);
    return cached;
  }

  const jwt = process.env.JWT_SIGNING_SECRET;
  if (!jwt) {
    throw new Error(
      "Audit signing key unavailable: set AUDIT_EXPORT_SIGN_KEY or JWT_SIGNING_SECRET.",
    );
  }
  // Derive a 32-byte seed from the JWT secret. SHA-256 keeps the result deterministic
  // across deploys with the same JWT secret. We import dynamically because Node's
  // `crypto` is available in route handlers but not in the browser.
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const seed = createHash("sha256").update(`audit-export-v1:${jwt}`).digest();
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

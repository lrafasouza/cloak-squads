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
 * Sign an export payload. The signature covers `signedAt || vault || linkId || data`
 * so an auditor verifying offline binds the export to one specific link, not
 * just the bytes.
 */
export function signAuditExport(args: {
  vault: string;
  linkId: string;
  contentType: "text/csv" | "application/json";
  data: string;
}): SignedAuditExport {
  const kp = getAuditSigningKeypair();
  const signedAt = new Date().toISOString();
  const message = new TextEncoder().encode(`${signedAt}|${args.vault}|${args.linkId}|${args.data}`);
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

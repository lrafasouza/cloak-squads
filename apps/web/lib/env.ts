import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta", "testnet", "localnet"]),
  NEXT_PUBLIC_RPC_URL: z.string().url(),
  // Optional explicit WS endpoint. When omitted, web3.js derives it from the
  // HTTP URL (https → wss). Helius needs the api-key on the WS URL too, so
  // setting this explicitly avoids losing the query string.
  NEXT_PUBLIC_RPC_WS_URL: z.string().url().optional(),
  NEXT_PUBLIC_CLOAK_PROGRAM_ID: z.string().min(32),
  NEXT_PUBLIC_CLOAK_RELAY_URL: z.string().url(),
  NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID: z.string().min(32),
  NEXT_PUBLIC_SQUADS_PROGRAM_ID: z.string().min(32),
});

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Shared fallback for SESSION_HMAC_KEY / FIELD_CRYPTO_KEY / AUDIT_EXPORT_SIGN_KEY
  // when those purpose-specific vars are not set. New deployments should set
  // each of the three explicitly so a single leak does not compromise all
  // three subsystems (sessions, encrypted PII, audit signatures) at once.
  JWT_SIGNING_SECRET: z.string().min(16),
  // HMAC key for session cookies (auth-session). Falls back to
  // JWT_SIGNING_SECRET. Rotating invalidates all live session cookies.
  SESSION_HMAC_KEY: z.string().min(16).optional(),
  // AES-256-GCM key for field-crypto (stealth memos, UTXO secrets). Falls
  // back to JWT_SIGNING_SECRET. Rotating without a re-encrypt script makes
  // every `v1.` ciphertext row undecryptable.
  FIELD_CRYPTO_KEY: z.string().min(16).optional(),
  // Ed25519 signing seed (32 bytes, base64-encoded) for audit export
  // signatures. Falls back to JWT_SIGNING_SECRET in audit-sign.ts. Rotating
  // means previously-issued export signatures stop verifying with the
  // current public key — embed the publicKey in the export envelope so old
  // exports are still verifiable offline against the snapshot pubkey.
  AUDIT_EXPORT_SIGN_KEY: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  FALLBACK_RPC_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  REDIS_TOKEN: z.string().optional(),
  // v1 wallet signatures are NOT endpoint-bound (no method/path/bodyHash).
  // A captured v1 signature replays for the timestamp window on any route,
  // which neuters the v2 hardening. Default OFF; set to "true" only as a
  // temporary escape hatch while a stale client is still in the wild.
  ALLOW_LEGACY_AUTH: z.enum(["true", "false"]).default("false"),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_RPC_WS_URL: process.env.NEXT_PUBLIC_RPC_WS_URL,
  NEXT_PUBLIC_CLOAK_PROGRAM_ID: process.env.NEXT_PUBLIC_CLOAK_PROGRAM_ID,
  NEXT_PUBLIC_CLOAK_RELAY_URL: process.env.NEXT_PUBLIC_CLOAK_RELAY_URL,
  NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID: process.env.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID,
  NEXT_PUBLIC_SQUADS_PROGRAM_ID: process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID,
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SIGNING_SECRET: process.env.JWT_SIGNING_SECRET,
    SESSION_HMAC_KEY: process.env.SESSION_HMAC_KEY,
    FIELD_CRYPTO_KEY: process.env.FIELD_CRYPTO_KEY,
    AUDIT_EXPORT_SIGN_KEY: process.env.AUDIT_EXPORT_SIGN_KEY,
    LOG_LEVEL: process.env.LOG_LEVEL,
    FALLBACK_RPC_URL: process.env.FALLBACK_RPC_URL,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_TOKEN: process.env.REDIS_TOKEN,
    ALLOW_LEGACY_AUTH: process.env.ALLOW_LEGACY_AUTH,
  });
}

export type PublicEnv = typeof publicEnv;
export type ServerEnv = ReturnType<typeof getServerEnv>;

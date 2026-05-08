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

const serverEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    // DEPRECATED — kept in the schema only so existing `.env` files don't
    // fail validation during the cutover. The runtime crypto helpers no
    // longer read this env (they each require their purpose-specific key).
    // Remove from your env after confirming SESSION_HMAC_KEY,
    // FIELD_CRYPTO_KEY, and AUDIT_EXPORT_SIGN_KEY are all set.
    JWT_SIGNING_SECRET: z.string().min(16).optional(),
    // HMAC key for stateless tokens — session cookies (`auth-session`)
    // and stealth-claim challenges (`claim-challenge`). Each call site
    // domain-separates further (`session-hmac-v1:`, `challenge-hmac-v1:`)
    // so the two derived keys are cryptographically distinct. Rotating
    // invalidates live sessions + open challenges (≤30 min and ≤60 s).
    SESSION_HMAC_KEY: z.string().min(16).optional(),
    // AES-256-GCM key for field-crypto (stealth memos, UTXO secrets,
    // operator deposit cache). Rotating mid-flight without the
    // rotate-field-crypto script makes every `v1.` row undecryptable —
    // see FIELD_CRYPTO_KEY_PREVIOUS for the dual-read window.
    FIELD_CRYPTO_KEY: z.string().min(16).optional(),
    // Optional dual-read fallback during a FIELD_CRYPTO_KEY rotation.
    // Decrypt path tries FIELD_CRYPTO_KEY first, falls back to
    // FIELD_CRYPTO_KEY_PREVIOUS. Unset under steady state.
    FIELD_CRYPTO_KEY_PREVIOUS: z.string().min(16).optional(),
    // Ed25519 signing seed for audit export signatures. Either base64 of
    // 32 bytes (preferred) or any non-empty string (audit-sign.ts derives
    // the seed via SHA-256 in that case). Each export embeds the verifying
    // `publicKey` in its envelope, so rotating only impacts new exports —
    // historical exports remain verifiable offline against their bundled
    // pubkey.
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
  })
  .superRefine((env, ctx) => {
    // Production must set every purpose-specific key explicitly. The
    // JWT_SIGNING_SECRET fallback is a migration aid only — leaving it
    // active in production means one leak still compromises all four
    // subsystems, which defeats the whole point of the split.
    if (process.env.NODE_ENV !== "production") return;
    const required = ["SESSION_HMAC_KEY", "FIELD_CRYPTO_KEY", "AUDIT_EXPORT_SIGN_KEY"] as const;
    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production. Falling back to JWT_SIGNING_SECRET keeps the four crypto subsystems sharing one secret — set this explicitly in the deploy env.`,
        });
      }
    }
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
    FIELD_CRYPTO_KEY_PREVIOUS: process.env.FIELD_CRYPTO_KEY_PREVIOUS,
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

// IMPORTANT: do NOT eagerly validate the server schema at module load.
// env.ts is imported by route modules and Next.js's `next build` evaluates
// those modules during static generation — at that point DATABASE_URL and
// other runtime envs are absent because Render injects them only at
// startup (`fromDatabase: ...` is a runtime binding). A module-load throw
// crashes the build / poisons prerendered HTML with a 500.
//
// The boot-time validation lives in `instrumentation.ts` instead, which
// Next.js guarantees to run only at runtime startup. That's the right hook.

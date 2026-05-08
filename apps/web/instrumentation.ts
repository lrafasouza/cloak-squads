/**
 * Next.js boot hook — runs once before any request is served.
 *
 * Validates the server env schema (lib/env.ts:serverEnvSchema) so a
 * missing crypto key (SESSION_HMAC_KEY / FIELD_CRYPTO_KEY /
 * AUDIT_EXPORT_SIGN_KEY) aborts the boot and surfaces the exact var
 * name in the Render log, instead of failing the first request that
 * touches the affected subsystem.
 *
 * Why a hook (not a top-level call in env.ts): env.ts is imported during
 * `next build`'s static-generation phase, where runtime envs like
 * DATABASE_URL aren't injected yet. Validating there crashes the build.
 * `register` only fires at runtime startup, so it's the correct place.
 */
export async function register() {
  // Edge runtime sets NEXT_RUNTIME=edge; we only validate on Node where
  // these envs are actually read.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getServerEnv } = await import("./lib/env");
  try {
    getServerEnv();
  } catch (err) {
    // Re-throw so Next.js (and Render) sees the failure and the log shows
    // the Zod issue list instead of a generic startup error.
    console.error("[boot] server env validation failed:", err);
    throw err;
  }
}

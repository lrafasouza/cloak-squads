/**
 * Next.js boot hook — runs once before any request is served.
 *
 * Validates the server env schema (lib/env.ts:serverEnvSchema) so a
 * missing crypto key (SESSION_HMAC_KEY / FIELD_CRYPTO_KEY /
 * AUDIT_EXPORT_SIGN_KEY) aborts the boot and surfaces the exact var
 * name in the Render log.
 *
 * Why a hook (not a top-level call in env.ts): env.ts is imported during
 * `next build`'s static-generation phase, where runtime envs like
 * DATABASE_URL aren't injected yet. Validating there crashes the build.
 * `register` only fires at runtime startup.
 *
 * Why `process.exit(1)` instead of throwing: Next.js's standalone server
 * catches errors thrown from `register()`, logs `"Failed to prepare
 * server"`, and KEEPS RUNNING. The process stays bound to the port and
 * Render's healthcheck passes — but every crypto-touching request 500s
 * because the missing env still isn't there. Verified by hand: a throw
 * here doesn't propagate as a non-zero exit. `process.exit(1)` is the
 * only signal Render reliably treats as deploy-failure.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getServerEnv } = await import("./lib/env");
  try {
    getServerEnv();
  } catch (err) {
    console.error(
      "\n[boot] server env validation failed — aborting startup:\n",
      err instanceof Error ? err.message : err,
    );
    // Force a non-zero exit so Render fails the deploy and rolls back
    // automatically. A throw alone is swallowed by Next.js's standalone
    // server (the process stays alive, healthcheck passes, runtime 500s).
    process.exit(1);
  }

  // Optional Sentry init — no-op when SENTRY_DSN is unset or
  // @sentry/nextjs isn't installed. See apps/web/lib/sentry.ts for the
  // activation recipe. Deliberately runs AFTER env validation so a
  // missing crypto key still wins the boot-fail race.
  try {
    const { initSentry } = await import("./lib/sentry");
    await initSentry();
  } catch (err) {
    // initSentry is wrapped in its own try/catch already. Any leak past
    // that is suspicious — log but never crash the boot for monitoring.
    console.warn(
      "[boot] sentry init unexpectedly threw — continuing without it:",
      err instanceof Error ? err.message : err,
    );
  }
}

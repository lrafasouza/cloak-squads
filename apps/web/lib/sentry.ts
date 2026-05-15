/**
 * Sentry integration — optional, DSN-gated.
 *
 * The `@sentry/nextjs` package is intentionally NOT a hard dependency. It
 * ships when the operator has a Sentry account and sets `SENTRY_DSN`. Until
 * then this module is fully inert (zero overhead, zero crashes on missing
 * module).
 *
 * Activation steps (when ready):
 *   1. Sign up at sentry.io, create a Next.js project, copy the DSN.
 *   2. `pnpm -F web add @sentry/nextjs` (the dynamic import below picks it
 *      up automatically — no other code changes needed).
 *   3. Set `SENTRY_DSN` on Render (sync: false). Optionally also set
 *      `SENTRY_TRACES_SAMPLE_RATE` to override the default 0.1.
 *   4. Redeploy. `instrumentation.ts:register()` calls `initSentry()` and
 *      a successful init logs "[sentry] initialized" once at boot.
 *
 * Design notes:
 *   - The `const moduleName = ...` indirection prevents bundlers from
 *     statically resolving the import at build time, which would fail
 *     when the package isn't installed. Same pattern as rate-limit.ts
 *     uses for @upstash/redis.
 *   - `captureException` is async + try/catch wrapped so the reporter
 *     never propagates an error into the call site. We do NOT want a
 *     monitoring tool to crash a request handler.
 *   - Sample rate defaults to 0.1 to keep Sentry's free-tier event
 *     quota usable. Override per environment if costs allow.
 */

// Minimal local type for the subset of @sentry/nextjs we use. Avoids a
// type-check dependency on the package being installed; the real types
// will tighten naturally once `pnpm add @sentry/nextjs` is run.
type SentryModule = {
  init: (opts: {
    dsn: string;
    environment?: string;
    release?: string;
    tracesSampleRate?: number;
    sendDefaultPii?: boolean;
  }) => void;
  captureException: (err: unknown) => void;
  captureMessage: (msg: string, level?: "info" | "warning" | "error") => void;
};

let sentryReady = false;
let initAttempted = false;

async function loadSentry(): Promise<SentryModule | null> {
  // Variable indirection so bundlers don't choke when the package
  // isn't installed (we want this file to compile in either state).
  const moduleName = "@sentry/nextjs";
  try {
    return (await import(moduleName)) as unknown as SentryModule;
  } catch {
    return null;
  }
}

export async function initSentry(): Promise<void> {
  if (initAttempted) return;
  initAttempted = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const Sentry = await loadSentry();
  if (!Sentry) {
    console.warn(
      "[sentry] SENTRY_DSN is set but @sentry/nextjs is not installed — skipping.",
    );
    return;
  }

  try {
    const release =
      process.env.RENDER_GIT_COMMIT ??
      process.env.GIT_COMMIT ??
      process.env.VERCEL_GIT_COMMIT_SHA;
    const options: Parameters<SentryModule["init"]>[0] = {
      dsn,
      environment:
        process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? process.env.NODE_ENV ?? "unknown",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
      // Don't ship PII by default. Operators can opt in later if they
      // need it for debugging a specific class of issue.
      sendDefaultPii: false,
    };
    if (release) options.release = release;
    Sentry.init(options);
    sentryReady = true;
    console.info("[sentry] initialized");
  } catch (err) {
    console.warn(
      "[sentry] init threw — continuing without reporter:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function captureException(err: unknown): Promise<void> {
  if (!sentryReady) return;
  const Sentry = await loadSentry();
  if (!Sentry) return;
  try {
    Sentry.captureException(err);
  } catch {
    // Never propagate a monitoring failure into the call site.
  }
}

export async function captureMessage(
  msg: string,
  level: "info" | "warning" | "error" = "info",
): Promise<void> {
  if (!sentryReady) return;
  const Sentry = await loadSentry();
  if (!Sentry) return;
  try {
    Sentry.captureMessage(msg, level);
  } catch {
    // Same as above.
  }
}

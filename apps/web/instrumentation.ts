/**
 * Next.js boot hook — runs once before any request is served.
 *
 * Sole job: import `lib/env` so its eager-validation block fires before
 * the first request lands. The schema check itself lives in env.ts (so
 * routes that import env.ts also get the side effect, double-belt). This
 * hook guarantees boot-time evaluation even if Next.js lazily loads route
 * modules on first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("./lib/env");
}

"use client";

import { setCircuitsPath } from "@cloak.dev/sdk-devnet";

/**
 * Redirect the Cloak SDK's transaction-circuit fetches to our same-origin proxy
 * (`/api/circuits/...`) instead of the S3 bucket, which lacks CORS headers.
 *
 * The SDK reads the wasm/zkey via `${circuitsPath}/transaction_js/transaction.wasm`
 * and `${circuitsPath}/transaction_final.zkey`, so we point it at the proxy base.
 *
 * The fetch monkey-patch is a belt-and-suspenders catch for any code path
 * (e.g. the withdraw circuits) whose URL is hardcoded inside the SDK.
 *
 * Two complementary mechanisms are installed:
 *
 *   1. `setCircuitsPath()` — overrides the URL used by `transact()` for the
 *      transaction circuits.
 *   2. `fetch` monkey-patch — rewrites any direct request to
 *      `cloak-circuits.s3.us-east-1.amazonaws.com` to the same-origin proxy.
 *      This catches the withdraw circuits, whose URL is hardcoded inside the
 *      SDK and not overridable through the public API
 *      (`resolveCircuitsUrl()` always returns the S3 default).
 *
 * See: docs/CORS_S3_CIRCUITS_ERROR.md
 */

const S3_HOST = "cloak-circuits.s3.us-east-1.amazonaws.com";
const S3_BASE = `https://${S3_HOST}`;
const PROXY_BASE_PATH = "/api/circuits";
const TRANSACTION_CIRCUITS_PROXY = `${PROXY_BASE_PATH}/0.1.0`;

let initialized = false;

function rewriteUrl(url: string): string {
  if (!url.startsWith(S3_BASE)) return url;
  // Replace the S3 origin with our proxy mount point so that
  // "/circuits/0.1.0/..." becomes "/api/circuits/0.1.0/...".
  const tail = url.slice(S3_BASE.length).replace(/^\/circuits/, "");
  return `${PROXY_BASE_PATH}${tail}`;
}

function patchFetch() {
  const w = window as typeof window & { __cloakFetchPatched?: boolean };
  if (w.__cloakFetchPatched) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let target: RequestInfo | URL = input;

    if (typeof input === "string") {
      target = rewriteUrl(input);
    } else if (input instanceof URL) {
      const rewritten = rewriteUrl(input.toString());
      if (rewritten !== input.toString()) target = rewritten;
    } else if (input instanceof Request) {
      const rewritten = rewriteUrl(input.url);
      if (rewritten !== input.url) target = new Request(rewritten, input);
    }

    return originalFetch(target as RequestInfo, init);
  }) as typeof fetch;

  w.__cloakFetchPatched = true;
}

export function ensureCircuitsProxy() {
  if (initialized) return;
  if (typeof window === "undefined") return;
  setCircuitsPath(TRANSACTION_CIRCUITS_PROXY);
  patchFetch();
  initialized = true;
}

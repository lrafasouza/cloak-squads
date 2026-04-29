# CORS Error Report — Cloak Circuits S3 Bucket

**Date:** 2026-04-29
**Severity:** High (blocks ZK proof generation, core feature)
**Status:** Resolved client-side via proxy + fetch monkey-patch (S3 CORS fix still recommended upstream)
**Reporter:** rafazaum

---

## 1. Summary

The frontend application (`aegis-web` on Render) is unable to fetch the `.wasm` circuit files required for ZK proof generation from the S3 bucket `cloak-circuits`. The browser blocks the request due to a missing `Access-Control-Allow-Origin` CORS header.

This blocks the **operator feature** entirely — users cannot submit cloaked transactions.

---

## 2. Affected Systems

- **Frontend:** `https://aegis-web-iiv0.onrender.com` (Render)
- **External resource:** `https://cloak-circuits.s3.us-east-1.amazonaws.com`
- **File blocked:** `circuits/0.1.0/transaction_js/transaction.wasm`
- **Feature impacted:** ZK proof generation (`submit` flow)

---

## 3. Error Evidence

### Browser console (Chrome)
```
Access to fetch at 'https://cloak-circuits.s3.us-east-1.amazonaws.com/circuits/0.1.0/transaction_js/transaction.wasm'
from origin 'https://aegis-web-iiv0.onrender.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.

GET https://cloak-circuits.s3.us-east-1.amazonaws.com/circuits/0.1.0/transaction_js/transaction.wasm
net::ERR_FAILED 200 (OK)
```

### Application log progression (before failure)
```
[cloak] Validating transaction parameters...
[cloak] Computing commitments...
[cloak] Computing external data hash...
[cloak] Fetching Merkle proofs...
[cloak] [Submit 1/41] Root: 2e7dc5351f581949..., nextIndex: 320
[cloak] Generating ZK proof...
[cloak] proof 10%
[cloak] proof 30%
-- CORS failure occurs here, flow halts --
```

The HTTP response is `200 OK`, confirming the file exists on S3. The failure is **strictly CORS policy enforcement by the browser**.

---

## 4. Root Cause

The S3 bucket `cloak-circuits` (us-east-1) does not have a CORS policy that allows cross-origin `GET` requests from `https://aegis-web-iiv0.onrender.com`. When the frontend attempts to fetch the `.wasm` file via `fetch()`, the browser sends a preflight or checks the response headers, finds no `Access-Control-Allow-Origin`, and blocks the request.

---

## 5. Reproduction Steps

1. Open the app at `https://aegis-web-iiv0.onrender.com`
2. Connect wallet and go through the operator submission flow
3. Observe the progress logs in browser console
4. At ~30% proof generation, the `transaction.wasm` fetch fails with `ERR_FAILED`

---

## 6. Proposed Fix

### Option A: Fix CORS on S3 (recommended)

The owner of the `cloak-circuits` S3 bucket must add the following CORS configuration:

```json
[
  {
    "AllowedOrigins": [
      "https://aegis-web-iiv0.onrender.com"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

If the app uses preview deployments or custom domains, add those origins too. Alternatively, use `"*"` for broader access (less secure, acceptable for public circuits).

### Option B: Proxy via backend (workaround)

If S3 access is not controlled by this team, the frontend can fetch the `.wasm` through a Next.js API route that acts as a proxy:

```ts
// apps/web/app/api/circuits/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const S3_BASE = 'https://cloak-circuits.s3.us-east-1.amazonaws.com';

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const url = `${S3_BASE}/${path}`;

  const res = await fetch(url);
  const body = await res.arrayBuffer();

  return new NextResponse(body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/wasm',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
```

Then point the Cloak SDK/client to use `/api/circuits/...` instead of the S3 URL directly.

---

## 7. Impact Assessment

| Metric | Impact |
|---|---|
| **User-facing?** | Yes — operator submit is fully broken |
| **ZK proof gen** | Halts at ~30%, no recovery |
| **Workaround for users?** | None without code change |
| **Dev workaround?** | Possible via backend proxy (Option B) |
| **Security risk?** | Low (public circuit files, no secrets) |

---

## 8. Next Actions

- [ ] **Infra team (Cloak):** Add CORS config to `cloak-circuits` S3 bucket (Option A) — still the right long-term fix.
- [x] **Dev team:** Implemented same-origin proxy + fetch monkey-patch (Option B). See section 9.
- [ ] **QA:** Re-test operator submit and claim flow after deploy.

---

## 9. Implemented Fix (this repo)

We shipped a self-contained workaround that does not depend on the upstream S3
CORS configuration.

### Files added / changed

- `apps/web/app/api/circuits/[...path]/route.ts` — Next.js Node-runtime route
  that proxies any request under `/api/circuits/...` to
  `https://cloak-circuits.s3.us-east-1.amazonaws.com/circuits/...`. Streams the
  upstream body, preserves `Content-Type`, and adds an aggressive
  immutable-cache header (artifacts are pinned per version).
- `apps/web/lib/cloak-circuits-proxy.ts` — client init helper
  `ensureCircuitsProxy()` that:
    1. Calls `setCircuitsPath("/api/circuits/0.1.0")` on the SDK so
       `transact()` (deposit/operator) loads `transaction.wasm` and
       `transaction_final.zkey` from the same origin.
    2. Monkey-patches `window.fetch` to rewrite any direct request whose URL
       starts with `https://cloak-circuits.s3.us-east-1.amazonaws.com` to the
       proxy path. This catches the **withdraw** circuits, whose URL is
       hardcoded inside the SDK — `resolveCircuitsUrl()` in
       `@cloak.dev/sdk-devnet@0.1.5-devnet.0` always returns the S3 default
       and ignores any override.
- `apps/web/app/vault/[multisig]/operator/page.tsx` — calls
  `ensureCircuitsProxy()` before `transact()` / `fullWithdraw()`.
- `apps/web/app/claim/[stealthId]/page.tsx` — calls
  `ensureCircuitsProxy()` before `fullWithdraw()`.

### Why both `setCircuitsPath` and the fetch patch?

The SDK has two parallel circuit-resolution paths:

| Flow | Resolver | Overridable? |
|---|---|---|
| `transact()` (deposit) | mutable `circuitsPath` + `setCircuitsPath()` | yes |
| `fullWithdraw()` | `resolveCircuitsUrl()` — hardcoded to `DEFAULT_CIRCUITS_URL` | no |

The monkey-patch is the only way to redirect the withdraw path without
forking the SDK.

### Verification

- `pnpm -F web typecheck` passes.
- After deploy: operator submit should fetch
  `/api/circuits/0.1.0/transaction_js/transaction.wasm` and
  `/api/circuits/0.1.0/transaction_final.zkey` instead of S3, and the proof
  generation should proceed past 30%.

### When to remove this workaround

Once the Cloak team adds CORS to the S3 bucket and (separately) fixes
`resolveCircuitsUrl()` to honor a custom `circuitsPath`, the proxy and the
`fetch` monkey-patch can be deleted. Until then both layers are required.

---

*Report generated from browser console logs and application flow analysis.*

# Cloak Devnet Relay Outage — Discord Report

**Audience:** Cloak core team / `cloak.ag/discord`
**Reporter:** `cloak-squads` hackathon team (Cloak Track, deadline 2026-05-14)
**Date:** 2026-04-29
**Repo:** internal — full diagnosis in `docs/cloak-relay-report.md`, repro via `curl` below

---

## TL;DR

`https://api.devnet.cloak.ag/range-quote` is returning HTTP 502 because the relay's internal Helius RPC API key is returning 401 Unauthorized. The relay healthcheck confirms `solana_rpc: false` and `status: "degraded"`. No SDK version change or code fix on our side can unblock this — the relay infra needs to be fixed by the Cloak team.

---

## Environment

| | |
|---|---|
| SDK | `@cloak.dev/sdk-devnet@0.1.5-devnet.1` |
| Relay | `https://api.devnet.cloak.ag` |
| Relay healthcheck | `https://api.devnet.cloak.ag/health` |
| Relay risk quote | `https://api.devnet.cloak.ag/range-quote` |
| Cloak program | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| RPC | `https://api.devnet.solana.com` |
| Verified at | `2026-04-29T01:39:54 UTC` |

---

## What we observed

### Healthcheck — HTTP 503

```bash
curl https://api.devnet.cloak.ag/health
```

```json
{
  "checks": {
    "circuit_breaker": "Closed",
    "database": true,
    "solana_rpc": false
  },
  "status": "degraded",
  "swap_monitor": {
    "deferred_swaps_checked": 0,
    "swap_refunds_failed": 0,
    "swap_timeouts_closed": 0
  },
  "timestamp": "2026-04-29T01:39:54.567133020+00:00",
  "tx_alt_addresses": ["C1nufQ1WHM2JQq9S1Sd2demcsd2Z6wLvznpELQuhnyju"]
}
```

`solana_rpc: false` is the direct cause. The relay cannot talk to its own Solana RPC node.

### `/range-quote` — HTTP 502

```bash
curl "https://api.devnet.cloak.ag/range-quote?wallet=<any_valid_pubkey>"
```

```json
{
  "error": "solana_rpc_error",
  "message": "Internal server error: Failed to get Solana slot for range quote: Internal server error: HTTP status client error (401 Unauthorized) for url (https://devnet.helius-rpc.com/?api-key=<redacted>)"
}
```

The relay uses Helius as its internal RPC provider. Helius is returning 401, which means the API key on the relay server is expired, revoked, or over quota.

---

## Failure chain

```
SDK calls transact() / deposit()
  → SDK derives riskQuoteUrl = relay + "/range-quote"
    → GET /range-quote?wallet=...
      → Relay calls helius-rpc.com internally
        → 401 Unauthorized (invalid/expired API key)
      → Relay returns 502 to SDK
    → SDK throws: "Risk quote request failed (502): ..."
  → Cloak program never receives the required Ed25519 instruction
→ Program rejects with custom error 0x10b3
  ("Transaction reached the on-chain program without the required Ed25519 sanctions quote instruction")
```

The SDK's own error map at `dist/index.js:488` describes this exact error code:

> "Transaction reached the on-chain program without the required Ed25519 sanctions quote instruction. This is a relay bug — the relay constructed the tx without attaching the signed quote. Caller retry will not help."

---

## What we verified independently

- The failure is **not transient** — reproduced consistently across multiple requests over multiple minutes.
- The `circuit_breaker` check is `Closed`, meaning the relay is not in a self-healing fast-fail state — it is actively trying and failing on every request.
- The `database` check is `true` — the relay DB is fine; only the Solana RPC connection is broken.
- The SDK is calling the endpoint correctly with the right query parameter format (`?wallet=<base58>`), confirmed by reading `fetchRiskQuoteInstruction` in `dist/index.js:4393`.
- This error is **independent of which wallet, amount, or token** is passed — the relay fails before processing any of those parameters (it cannot even get the current Solana slot).

---

## What the SDK does when this happens

The SDK has an env-var escape hatch:

```
CLOAK_DISABLE_RELAY_RISK_QUOTE_AUTO_DERIVE=1
```

Setting this skips the auto-derived `riskQuoteUrl`. However, without a working `riskQuoteUrl`, `getRiskQuoteInstruction`, or a valid `rangeApiKey` (which requires `@switchboard-xyz/on-demand`), the program still rejects the transaction because the Ed25519 instruction is missing.

There is no client-side workaround available to us that does not require either a working relay or direct access to a Switchboard oracle queue.

---

## Asks

1. **Fix the Helius API key** on the devnet relay — it is returning 401. The endpoint `https://devnet.helius-rpc.com/` needs a valid key to be configured on the server.
2. **Alternatively**, confirm whether there is a public `rangeApiKey` (Switchboard) we can use as a stopgap — we can install `@switchboard-xyz/on-demand` and bypass the relay for the risk quote.
3. **ETA** on relay recovery so we can plan around the hackathon deadline (2026-05-14).

---

## Discord-ready short version

Paste this into `#dev-help` / `#bugs`:

> Hey team! Building a Squads × Cloak integration for the Cloak Track hackathon. The devnet relay seems to be down:
>
> `GET https://api.devnet.cloak.ag/range-quote?wallet=<any>` → HTTP 502
> ```json
> { "error": "solana_rpc_error", "message": "Failed to get Solana slot for range quote: HTTP status client error (401 Unauthorized) for url (https://devnet.helius-rpc.com/?api-key=<redacted>)" }
> ```
>
> Healthcheck at `/health` confirms `"solana_rpc": false` and `"status": "degraded"`.
>
> The relay's internal Helius API key appears to be expired or revoked. This breaks `transact()` / `deposit()` for everyone on devnet — the program rejects with `0x10b3` because the required Ed25519 risk-quote instruction never makes it into the transaction.
>
> No client-side fix possible. Is there an ETA for the relay being restored? Or is there a public Switchboard `rangeApiKey` we can use as a stopgap?

---

## Internal references

- `docs/cloak-discord-report.md` — previous report (SDK discriminator bug, resolved 2026-04-27)
- `docs/devnet-blocker.md` — deep dive on the original SDK issue
- `packages/core/src/cloak-direct-mode.ts` — current workaround using `transact()` directly

---

## Update log

- **2026-04-29** — relay outage detected and confirmed. Report compiled. Discord post pending.

# API Auth Matrix

> Authoritative classification of every API route handler.
> Frontend: use this to decide `fetchWithAuth` vs `fetch` for each endpoint.

## Routes

| Route | Method | Auth | Notas |
|---|---|---|---|
| /api/proposals | POST | 🔒 | `requireWalletAuth()` — cria draft |
| /api/proposals/[multisig] | GET | 🌐 | lista pública, sem auth |
| /api/proposals/[multisig]/[index] | GET | 🌐/🔒 | leitura pública sem `commitmentClaim`; `?includeSensitive=true` exige `requireWalletAuth()` |
| /api/proposals/[multisig]/[index] | PATCH | 🔒 | `requireWalletAuth()` — archive/unarchive (TICKET #13b) |
| /api/proposals/[multisig]/init-status | GET | 🌐 | público — lê on-chain + DB, sem auth (TICKET #20) |
| /api/payrolls | POST | 🔒 | `requireWalletAuth()` — cria payroll |
| /api/payrolls/[multisig] | GET | 🌐 | lista pública, sem auth |
| /api/payrolls/[multisig]/[index] | GET | 🌐/🔒 | leitura pública sem recipient `commitmentClaim`; `?includeSensitive=true` exige `requireWalletAuth()` |
| /api/audit-links | POST | 🔒 | `requireWalletAuth()` — emite link |
| /api/audit-links/[vault] | GET | 🌐 | lista pública, sem auth |
| /api/audit/[linkId] | GET | 🌐 | leitura pública compartilhável, sem auth |
| /api/audit/[linkId]/revoke | POST | 🔒 | `requireWalletAuth()` — revoga link |
| /api/stealth | POST | 🔒 | `requireWalletAuth()` — cria stealth invoice |
| /api/stealth/[id] | GET | 🌐 | lista invoices por cofreAddress, sem auth |
| /api/stealth/[id]/claim | POST | 🔒 | `requireWalletAuth()` — claim invoice |
| /api/stealth/[id]/utxo | PATCH | 🔒 | `requireWalletAuth()` — atualiza UTXO data |
| /api/circuits/[...path] | GET | 🌐 | proxy público (CORS bypass) |
| /api/circuits/[...path] | HEAD | 🌐 | proxy público (CORS bypass) |
| /api/cloak-relay/[...path] | GET | 🌐 | proxy público |
| /api/cloak-relay/[...path] | POST | 🌐 | proxy público |
| /api/cloak-relay/[...path] | HEAD | 🌐 | proxy público |

## Classification method

Each handler was classified by reading the source code:

- **🔒 Private** — handler calls `requireWalletAuth()` at the top and returns 401 if missing.
- **🌐 Public** — handler does NOT call `requireWalletAuth()` or `verifyWalletAuth()`.
- **Mixed** — one method is public, another is private (e.g. GET public, PATCH private).

## Issues found

### ✅ Resolved: sensitive `commitmentClaim` is no longer public

`GET /api/proposals/[multisig]/[index]` now returns a public DTO by default and omits `commitmentClaim`. Callers that need private execution material must request `?includeSensitive=true` and pass wallet auth headers.

`GET /api/payrolls/[multisig]/[index]` follows the same pattern for per-recipient `commitmentClaim`.

### 🟡 GET /api/stealth/[id] exposes UTXO data without auth

The GET handler at `apps/web/app/api/stealth/[id]/route.ts` returns `utxoAmount`, `utxoPublicKey`, `utxoBlinding`, `utxoMint`, `utxoLeafIndex`, `utxoCommitment` without auth. While `utxoPrivateKey` is correctly excluded, the other UTXO fields may be sensitive depending on the threat model.

**Recommendation:** Review whether non-private-key UTXO fields should be public. Consider requiring auth if these are meant to be private.

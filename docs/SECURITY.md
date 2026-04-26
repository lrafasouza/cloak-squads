# Security Model

## V1 Operator-Gated Security

The current security model is **operator-gated**. The operator wallet is the only entity that can consume licenses and execute private transfers.

### Trust Assumptions

| Assumption | Enforced By |
|-----------|-------------|
| Only the registered operator can execute with a license | On-chain: `execute_with_license` checks `operator == signer` |
| Licenses are single-use | On-chain: License status transitions `Active → Consumed`, checked before execution |
| Licenses expire after TTL | On-chain: `expires_at` checked against `Clock::get().slot` |
| Payload integrity is verified | On-chain: `payload_hash` in License must match invariants in `execute_with_license` |
| Only Squads vault PDA can issue licenses | On-chain: `issue_license` verifies vault PDA via `verify_squads_vault_signer` |
| CPI target is the expected program | On-chain: `execute_with_license` validates CPI target against `CLOAK_MOCK_PROGRAM_ID` |

### On-Chain Error Codes

| Code | Error | Meaning |
|------|-------|---------|
| 6001 | `NotOperator` | Caller is not the registered operator |
| 6002 | `LicenseExpired` | License TTL has passed |
| 6003 | `LicenseConsumed` | License was already used |
| 6004 | `LicensePayloadMismatch` | Invariants hash doesn't match license |
| 6007 | `InvalidCpiTarget` | CPI target is not the configured Cloak program |
| 6011 | `LicenseNotExpired` | Tried to close a license that hasn't expired |
| — | `InvalidSquadsSigner` | Vault PDA verification failed |
| — | `InvalidTtl` | TTL value out of range |

### 2-Transaction Pattern

Execution requires two separate transactions:

1. **`vaultTransactionExecute`** (via Squads) — Creates the License account with the payload hash
2. **`execute_with_license`** (via operator wallet) — Consumes the license and performs the private transfer

This separation ensures that:
- The Squads vault controls when a license is issued (requires threshold approval)
- The operator controls when the transfer executes (can delay or refuse)
- Even if a license is issued, the operator must be online to consume it

## Frontend Security

### Sensitive Data Handling

| Data | Storage | Rationale |
|------|---------|-----------|
| `r` (note randomness) | `sessionStorage` only | Required for commitment recompute; never leaves browser |
| `sk_spend` (spend key) | `sessionStorage` only | Required for commitment recompute; never leaves browser |
| `commitmentClaim` (full claim) | `sessionStorage` only | Contains secrets above; not sent to API |
| Proposal metadata (amount, recipient, hash) | SQLite via Prisma | Non-sensitive; needed for UI display |
| Invariants (nullifier, commitment bytes) | SQLite via Prisma | Public on-chain data; needed for operator execution |

### Input Validation

- **POST `/api/proposals`**: Zod schema validates all fields including byte array lengths (32 bytes for hashes, 16 for nonce), string patterns, and ranges
- **JSON body parsing**: Wrapped in try/catch to return 400 on malformed input
- **Unique constraint**: `@@unique([cofreAddress, transactionIndex])` prevents duplicate drafts

### Commitment Verification

The commitment check card recomputes the commitment locally using `computeCommitment` from `@cloak.dev/sdk-devnet` and compares it against the on-chain value. This is a defense-in-depth measure:

- **Match** — Proposal is consistent, safe to approve
- **Mismatch** — Proposal was tampered, reject immediately (approve button blocked)
- **Unavailable** — SDK failed to load, voting still allowed (gatekeeper enforces payload hash on-chain)

## Known Security Limitations

### Current (V1)

1. **Mock proofs** — `execute_with_license` passes 256 zero bytes as the Groth16 proof. The `cloak-mock` program accepts this without verification. In production, the real Cloak program verifies the proof on-chain.
2. **Hardcoded CPI target** — `CLOAK_MOCK_PROGRAM_ID` is hardcoded in `execute_with_license.rs`. Must be made configurable before mainnet.
3. **Threshold 1 only** — The UI handles display for multi-member but the tested flow is 1-of-1.
4. **No rate limiting** — API routes have no rate limiting. An attacker could spam the SQLite database.
5. **Operator rotation** — `set_operator` is callable by any vault signer. Consider restricting to a higher threshold for production.

### Production Requirements (Before Mainnet)

- [ ] Replace `cloak-mock` with real Cloak program for proof verification
- [ ] Make CPI target configurable (not hardcoded)
- [ ] Add compute budget instructions (done: 1.4M CU + priority fee)
- [ ] Implement root-stale retry pattern (3x) for real Cloak execution
- [ ] Add rate limiting on API routes
- [ ] Consider operator rotation threshold requirement
- [ ] Audit the `verify_squads_vault_signer` CPI verification for edge cases
- [ ] Add `ARCHITECTURE.md` and `SECURITY.md` documentation (this document)

### Blocked by Upstream

- Real Cloak SDK proofs on devnet — SDK `deposit()` is broken (see `docs/devnet-blocker.md`)
- End-to-end mainnet smoke test — requires real SOL (~0.015 SOL for deposit + withdraw)

## Threat Model

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Unauthorized execution | Operator check on-chain | **Enforced** |
| Replay attack | License single-use (Consumed state) | **Enforced** |
| Expired license execution | TTL check on-chain | **Enforced** |
| Payload tampering | Payload hash in License, verified at execute | **Enforced** |
| Unauthorized license creation | Squads vault PDA verification | **Enforced** |
| Wrong CPI target | Program ID check in execute_with_license | **Enforced** (hardcoded) |
| Front-running | License tied to specific operator wallet | **Mitigated** — operator is explicit |
| Fake proof submission | Real Cloak verifies Groth16 proof | **NOT YET** — using mock |
| Server-side secret leak | Secrets in sessionStorage only | **Enforced** |
| SQL injection | Prisma typed queries (no raw SQL) | **Enforced** |

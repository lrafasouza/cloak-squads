# Design Spec — `cloak-squads-private-module`

**Status**: draft, approved via brainstorming
**Date**: 2026-04-24
**Target submission**: Cloak Track (Superteam Earn + Colosseum Frontier Hackathon), deadline 2026-05-14
**Author**: Rafael (rafazaum)

---

## Executive Summary

A **Squads v4 execution module** that adds *private execution via Cloak shielded pool* to any existing Solana multi-sig treasury. Any multisig already running on Squads can add an "Execute Private" action: proposals still pass through Squads governance (N-of-M threshold), but execution routes through the Cloak shielded pool — payment amounts, recipients, and counterparty addresses are hidden from the public Solana ledger, while remaining auditable through scoped viewing keys.

**Target user (V1)**: startups and scale-ups using Squads as their corporate treasury vehicle. Payroll, contractor payments, vendor settlements, and token distribution — without the public ledger exposing salaries, vendor relationships, or treasury strategy.

**Terminology note**: throughout this spec, *"operator"* refers to the single Solana account (pubkey) designated in `Cofre.operator` that holds the Cloak spend key and is authorized to invoke `execute_with_license`. Operator is a role, typically filled by the CFO or a shared HSM. The operator is distinct from Squads *signers*, who approve proposals but never hold the spend key.

**Why this matters for the Cloak Track**: the Cloak team explicitly suggested multi-sig as a direction. Composing their shielded pool with Squads is an unsolved problem in the Solana ecosystem — no production product exists. This module makes privacy *load-bearing*: remove Cloak, and the product collapses back into the public-by-default Squads experience everyone already has.

---

## Track Alignment

Directly addresses three of the five "What You Can Build" directions from the Cloak Track brief:

| Direction | How we address it |
|---|---|
| **#1 Private payroll / contractor payments** | Batch disbursement via Squads-approved proposal; admin configures recipients, signers approve, the full batch executes as a chain of shielded transacts. |
| **#2 B2B payments and treasury flows** | Core use case — protocol treasuries, startup treasuries, and DAOs paying vendors without telegraphing strategy. |
| **#4 Compliance & audit tooling** | Viewing keys exported as scoped `Audit Links` (full, amounts-only, time-ranged) — exactly the "underexplored" angle the brief calls out. Auditors use the link without touching ZK mechanics. |

Capabilities from the Cloak SDK used meaningfully:

1. **Private transfers** between shielded accounts — core of F1.
2. **Batch disbursement** — core of F2, chained through 2-in/2-out circuit with change threading.
3. **Stealth addresses** — F4 claim-link invoicing.
4. **Viewing keys (scoped)** — F3 + F3.5; uses `deriveDiversifiedViewingKey` + `toComplianceReport` + `formatComplianceCsv`.
5. *(Roadmap)* Private swaps via Orca — deferred to V2 to concentrate scope.

---

## Non-Goals

- **Not a multi-sig replacement**. We do not fork Squads; we integrate with Squads v4 as an external module.
- **Not a fork of Cloak**. We consume `@cloak.dev/sdk` as a client library.
- **Not a wallet**. Users bring Phantom / Backpack / Solflare via the standard Solana wallet adapter.
- **No threshold MPC proof generation in V1**. We ship *operator-gated* execution (see Security Model) and document threshold MPC as a V2 roadmap item.
- **No cross-chain support**. Solana-only. Cloak is Solana-only.
- **No in-house relayer**. We consume Cloak's relayer and Solana RPC through standard providers (Helius / Triton).

---

## Architecture

### High-level layering

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 15, App Router, TypeScript)              │
│  • UI: proposal preparation, approval, execution            │
│  • Batch payroll CSV uploader                               │
│  • Audit Access panel + shareable Audit Link                │
│  • Stealth invoice / claim UI                               │
│  • snarkjs WASM prover (browser)                            │
│  • @cloak.dev/sdk (CloakSDK, scanTransactions, etc.)        │
│  • @sqds/multisig (Squads v4 SDK)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼  Solana RPC (Helius / Triton)
┌─────────────────────────────────────────────────────────────┐
│  On-chain                                                    │
│                                                              │
│  Squads v4 vault_transaction_execute invokes one of:        │
│                                                              │
│   Case A — proposal phase:                                  │
│     cloak_gatekeeper::issue_license(payload_hash)           │
│                                                              │
│   Case B — execution phase (separate tx, operator-signed):  │
│     operator_tx -> cloak_gatekeeper::execute_with_license   │
│                      -> CPI -> cloak::transact(...)         │
│                                                              │
│  CPI depth in exec tx: 3 (operator -> gatekeeper -> Cloak), │
│  +1 if Cloak internally CPIs SPL token = 4 (at limit).      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼  HTTPS
┌─────────────────────────────────────────────────────────────┐
│  Off-chain                                                  │
│  • Cloak relayer (optional, we use RPC direct)              │
│  • Minimal Next.js API routes — audit-links, stealth        │
└─────────────────────────────────────────────────────────────┘
```

### Core design decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **2-transaction execution pattern** (license + execute) | Merkle root is stale between proposal creation and threshold approval; proof must regenerate at execute time. Decouples signer-approved *intent* (invariants) from execution-specific *proof bytes*. |
| 2 | **Operator-gated V1 security model** | Full Shamir threshold MPC of the Cloak spend key is out of scope for a 3-week hackathon. Instead, the operator (CFO/founder) holds the spend key; all spends are gated through a program-enforced license issued only by Squads consensus; signers verify commitments before approval to prevent operator fraud. |
| 3 | **Deterministic view key derivation + encrypted distribution** | Any signer can derive the view key to audit the treasury. Spend key derivation must **not** be known by any single signer (because determinism + single-sig execution = multi-sig bypass). View keys are encrypted per-signer with libsodium box and stored in a PDA. |
| 4 | **Browser-side Groth16 proving (snarkjs)** | SDK ships with `snarkjs`; no server-side prover. Matches "proofs in seconds client-side" Cloak marketing. |
| 5 | **Stateless scanning (no local note storage)** | Any signer opens the app, derives view key, scans Cloak via `scanTransactions`, reconstructs balance. Works across devices without sync. |
| 6 | **Cloak is mainnet-only** | Confirmed via direct RPC (devnet returns null for program account). We ship a `cloak-mock` stub for dev/test environments. |
| 7 | **Relayer primary, on-chain Merkle fallback in roadmap** | `buildMerkleTreeFromRelay` is canonical; `buildMerkleTreeFromChain` is available but slower. Document fallback as V2 for trust-minimized deployments. |

---

## Security Model

### Threat model

| Adversary | Capability | Goal | Our defense |
|---|---|---|---|
| External observer (concurrent, block explorer) | Read all on-chain data | Infer payroll amounts, vendor relationships, treasury strategy | Cloak shielded pool — valores e destinatários encriptados em commitments |
| Squads signer with malicious intent | Approve unauthorized proposals OR refuse to approve legitimate ones | Extract funds via collusion of majority OR DoS treasury | Squads threshold enforcement (unchanged); audit log via signer-shared view key |
| Compromised operator key | Bypass Squads approval, spend directly via relayer | Unauthorized treasury spending | Gatekeeper license system: program rejects any `execute_with_license` without a valid, Squads-issued license. Signers verify commitments before approval. Outgoing movements audited via shared view key (detection, not prevention). |
| Stale browser / cached material | Auditor or signer retains material after revocation | See historical data after access removal | **Accepted limitation**: view access to past data is irrevocable. Revocation blocks *future* access only. Documented explicitly. |

### V1 security: operator-gated execution

Three stacked protections, none perfect alone:

1. **Program assertion (on-chain)**: `cloak_gatekeeper::execute_with_license` requires a valid License PDA, which can only be created inside a Squads-approved `vault_transaction`. No License = no CPI to Cloak.
2. **Commitment verification (client-side, pre-approval)**: each signer's frontend decrypts the operator's payload claim, recomputes the commitment, and compares against the commitment encoded in the license. Mismatch → approval blocked in UI with red alarm.
3. **Auditable execution trail**: all outgoing movements are visible to signers through the shared view key. Malicious operator behavior is detectable within the same day.

### V2 roadmap security (documented, not built)

- **Shamir secret sharing of the spend key** matching Squads threshold (t-of-n). Cryptographically eliminates the operator-trust assumption.
- **`ovk` (outgoing view key) support** when exposed by Cloak SDK — improves auditability of outgoing movements beyond incoming notes.
- **Hardware security module (HSM) for operator key** — enterprise deployment path.

---

## Feature Specifications

### F1 — Execute Private

Single private transfer between shielded accounts, approved via Squads.

**Happy path**:
1. Operator opens UI, connects wallet, selects multisig. Frontend derives view key from encrypted distribution, scans Cloak with `scanTransactions`, displays shielded balance.
2. Operator prepares: recipient (Cloak address), amount, token (USDC / USDT / SOL).
3. Frontend computes `payload_hash = SHA256("cloak-squads-payload-v1" || nullifier || commitment || amount_le || token || recipient_vk_pub || nonce_16)`. **No proof generated yet.**
4. Frontend creates Squads `vault_transaction` with one instruction: `cloak_gatekeeper::issue_license(payload_hash, nonce, ttl_secs=900)`.
5. Signers open proposal. Their frontend decrypts the payload claim (recipient, amount, random) using the view key, recomputes `commitment`, compares to the committed hash. Match → green indicator. Mismatch → red, approval button disabled.
6. Threshold reached. **Tx A** (Squads execute) issues License PDA.
7. **Tx B** (operator-signed, separate): operator regenerates proof with `getCurrentRoot`, calls `cloak_gatekeeper::execute_with_license(invariants, proof_bundle)`. Gatekeeper verifies invariants hash matches license, marks license consumed, CPIs to Cloak `transact`.
8. On `ROOT_STALE`, automatic retry (up to 3×) with fresh blockhash and fresh merkle state.

**Error states**: 17-item taxonomy — see [Error Handling](#error-handling).

### F2 — Batch Payroll

Multiple recipients in one approval cycle via chained `transact` calls.

**Approach**: one License per recipient → single Squads proposal containing N `issue_license` instructions → sequential execution of N Tx Bs by the operator.

**MVP cap**: 10 recipients per batch (safe margin for proof generation time, blockhash lifetime, and UX cognitive load).

**Partial-failure recovery**: if execution Tx N fails irrecoverably, chained Tx N+1..M's inputs become invalid (change output from N never created). UI offers "Replan from step N" — regenerates licenses N..M based on current pool state, creates a new Squads proposal for just those, signers re-approve.

### F3 — Audit Access (admin panel)

Admin issues scoped viewing keys. Three scopes:

- **Full** — all fields visible (for internal finance / integrations).
- **Amounts-only** — values + dates + tx types, counterparties and memos hidden (for external auditor, tax compliance).
- **Time-ranged** — restricted to a date window (for quarterly reviews, specific investigations).

**Implementation**: `deriveDiversifiedViewingKey(nk, diversifier)` where `diversifier = BLAKE3("cloak-audit-v1" || linkId || scope || startDate || endDate)`. Scope filters apply client-side when rendering.

**Revocation**: admin adds `diversifier[0..16]` (first 16 bytes of the 32-byte diversifier — collision-resistant for revocation lookup) to `Cofre.revoked_audit: Vec<[u8; 16]>`. Auditor frontend checks revocation list on each load.

### F3.5 — Audit Link (shareable, fragment-based URL)

Admin-issued link: `https://app/audit/<linkId>#v=1&k=<viewkey>&s=<adminSignature>&exp=<unix>`.

Fragment (`#...`) is never sent in HTTP request — access logs don't leak the key. Auditor opens, frontend:
1. Parses fragment.
2. Fetches `/api/audit-links/<linkId>` metadata.
3. Validates `adminSignature` against `issued_by` pubkey.
4. Checks on-chain revocation set.
5. Scans Cloak with the viewing key; renders read-only panel respecting scope.
6. **CSV export** via `formatComplianceCsv(toComplianceReport(scanResult))` — formatted for BR fiscal reporting (colunas: data, tipo, valor, contraparte, memo).

### F4 — Stealth Invoicing

Recipients without prior Cloak accounts can claim payments via one-time URL.

**Flow**:
1. Operator generates ephemeral `stealth_keypair = nacl.box.keyPair()`.
2. Operator creates an F1 transfer with `recipient_vk_pub = stealth_keypair.publicKey`.
3. Frontend produces claim URL: `https://app/claim/<stealthId>#v=1&sk=<stealth_secret>&cofre=<multisig>`.
4. Recipient opens URL in any browser, connects wallet (any Solana wallet). App derives spend authority from stealth key, submits `fullWithdraw` to connected wallet.
5. Gas funding: operator includes ~0.002 SOL dust in the stealth deposit so the recipient doesn't need SOL to claim.

**Void**: operator can reclaim pre-claim by using the still-held stealth key (stored encrypted in `License` extension) to `partialWithdraw` back to the treasury.

**Known trade-off**: signers approving F4 see only the ephemeral recipient pubkey + memo; identity verification of the actual recipient is out-of-band (invoice number, email).

---

## Data Model

### On-chain state (program `cloak-gatekeeper`)

#### Cofre PDA (one per Squads multisig)

```rust
#[account]
pub struct Cofre {
    pub multisig:          Pubkey,          // Squads multisig PDA
    pub operator:          Pubkey,          // execution key (mutable via Squads proposal)
    pub view_key_public:   [u8; 32],        // Cloak pvk, for lookup
    pub created_at:        i64,
    pub version:           u8,              // schema versioning
    pub revoked_audit:     Vec<[u8; 16]>,   // diversifier[0..16] (first 16 bytes); unbounded with realloc
    pub bump:              u8,
}
// Seeds: [b"cofre", multisig.as_ref()]
```

#### ViewKeyDistribution PDA (one per cofre, grows with signers)

```rust
#[account]
pub struct ViewKeyDistribution {
    pub cofre:   Pubkey,
    pub entries: Vec<EncryptedViewKey>,
    pub bump:    u8,
}

pub struct EncryptedViewKey {
    pub signer:       Pubkey,    // Solana pubkey
    pub ephemeral_pk: [u8; 32],  // X25519 box ephemeral
    pub nonce:        [u8; 24],  // libsodium box nonce
    pub ciphertext:   [u8; 48],  // 32B view key + 16B Poly1305 MAC
    pub added_at:     i64,
}
// Seeds: [b"vkd", cofre.key().as_ref()]
```

#### License PDA (ephemeral, one per approval-for-execution)

```rust
#[account]
pub struct License {
    pub cofre:           Pubkey,
    pub payload_hash:    [u8; 32],
    pub nonce:           [u8; 16],       // random 128-bit
    pub issued_at:       i64,
    pub expires_at:      i64,            // issued_at + ttl
    pub status:          LicenseStatus,  // Active | Consumed
    pub close_authority: Pubkey,         // operator, for auto-close
    pub bump:            u8,
}
// Seeds: [b"license", cofre.as_ref(), payload_hash.as_ref()]
// TTL default: 900s (15 min); batch default: 1800s (30 min)
```

### Instruction set (program `cloak-gatekeeper`)

1. `init_cofre(operator: Pubkey)` — one-time, requires Squads vault PDA as signer
2. `init_view_distribution(entries: Vec<EncryptedViewKey>)` — one-time, right after init_cofre
3. `add_signer_view(entry: EncryptedViewKey)` — gated by Squads proposal
4. `remove_signer_view(signer_pubkey: Pubkey)` — gated by Squads proposal
5. `issue_license(payload_hash, nonce, ttl_secs)` — invoked inside Squads `vault_transaction_execute`; verifies vault PDA is signer
6. `execute_with_license(invariants: StructuredInvariants, proof_bundle: ProofBundle)` — invoked by operator; verifies license, CPIs to Cloak
7. `close_expired_license()` — permissionless after expiry; refunds rent to operator
8. `emergency_close_license(license)` — gated by Squads; force-close during incident
9. `revoke_audit(diversifier_trunc: [u8; 16])` — gated by Squads; appends to revoked_audit (realloc as needed)
10. `set_operator(new_operator: Pubkey)` — gated by Squads

### Off-chain (Next.js API routes, SQLite/Postgres via Prisma)

Two tables only. Sensitive material never stored server-side.

```prisma
model AuditLink {
  id            String   @id @default(uuid())
  cofreAddress  String
  diversifier   Bytes    @db.ByteA  // 32 bytes
  scope         String   // "full" | "amounts_only" | "time_ranged" | "amounts_time_ranged"
  scopeParams   Json?    // { startDate, endDate }
  expiresAt     DateTime
  issuedBy      String   // admin pubkey
  signature     Bytes    @db.ByteA  // 64 bytes Ed25519
  createdAt     DateTime @default(now())

  @@index([cofreAddress])
}

model StealthInvoice {
  id                    String    @id @default(uuid())
  cofreAddress          String
  invoiceRef            String?   // free-form: "INV-2026-042"
  memo                  String?
  stealthPubkey         String    // pubkey only, safe
  amountHintEncrypted   Bytes?    // encrypted for operator lookup via cofre view key
  status                String    // "pending" | "claimed" | "voided" | "expired"
  expiresAt             DateTime
  createdAt             DateTime  @default(now())

  @@index([cofreAddress])
  @@index([stealthPubkey])
}
```

### Canonical derivations (byte-exact, cross-language)

All byte concatenations are explicit (no JSON / bincode). Integers little-endian. Pubkeys raw 32 bytes. Domain separators always precede payload.

```
// Operator's master seed (session-ephemeral)
master_seed = SHA256(
  b"cloak-squads-operator-v1\0" ||
  multisig_pda_bytes ||
  operator_wallet_signature(
    "cloak-squads-operator-v1:" || multisig_pda_base58
  )
)

CloakKeyPair = generateCloakKeys(master_seed)   // @cloak.dev/sdk

// Signer's decryption keypair (for view distribution)
decrypt_seed        = wallet.signMessage(
                        "cloak-squads-view-decrypt-v1:" || multisig_pda_base58
                      )
signer_x25519_kp    = nacl.box.keyPair.fromSecretKey(
                        HKDF(decrypt_seed, "view-decrypt", 32)
                      )

// Audit scope key
diversifier         = BLAKE3(
                        b"cloak-audit-v1\0" ||
                        linkId_bytes ||
                        scope_bytes ||
                        startDate_le8 ||
                        endDate_le8
                      )[0..32]
audit_view_keypair  = deriveDiversifiedViewingKey(nk, diversifier)   // @cloak.dev/sdk

// License payload binding
payload_hash = SHA256(
  b"cloak-squads-payload-v1\0" ||
  nullifier_32 ||
  commitment_32 ||
  amount_le8 ||
  token_mint_32 ||
  recipient_vk_pub_32 ||
  nonce_16
)

// Stealth key (per invoice)
stealth_kp          = nacl.box.keyPair()
stealth_claim_url   = `https://app/claim/<stealthId>#v=1&sk=<base58(stealth_kp.secretKey)>&cofre=<base58(multisig)>`
```

### URL / link schemas

All sensitive keys travel in the URL **fragment** (`#...`), not the path or query. Fragments never enter HTTP request lines, never appear in server access logs.

**Audit Link**:
```
https://app.example.com/audit/<linkId>
  #v=1
  &k=<base58(viewing_private_key_32)>
  &s=<base58(ed25519_signature_64)>
  &exp=<unix_ts>
```

**Stealth Claim Link**:
```
https://app.example.com/claim/<stealthId>
  #v=1
  &sk=<base58(stealth_spend_key_32)>
  &cofre=<base58(multisig_pubkey)>
```

---

## Error Handling

### Taxonomy (17 error codes across 5 categories)

**A. Crypto / SDK errors** (client-side, proof or scan)
- `PROOF_GEN_TIMEOUT` — snarkjs > 30s; retry 1× in Web Worker
- `PROOF_GEN_OOM` — browser memory; fallback to API-route prover (if implemented V2)
- `SCAN_DECRYPT_FAIL` — `tryDecryptNote` returns null for all notes; view key mismatch; alert user
- `MASTER_SEED_SIG_MISMATCH` — operator signature produced different seed; admin rotation required
- `COMMITMENT_MISMATCH` — blocking red alert; approval disabled

**B. Cloak / Merkle errors**
- `ROOT_STALE` — `RootNotFoundError`; regenerate proof with `getCurrentRoot` + `waitForRoot`; transparent retry (up to 3×)
- `INSUFFICIENT_SHIELDED_BALANCE` — UI pre-validates; surfaces at registration if bypassed
- `INVALID_PROOF` — Cloak verifier rejects; bug on our side; abort + log + call `verifyAllCircuits()` on next session
- `FEE_INSUFFICIENT` — `isWithdrawAmountSufficient` false; UI pre-validates and shows breakdown

**C. Squads errors**
- `PROPOSAL_EXPIRED` — Squads time-window; reopen proposal
- `INSUFFICIENT_APPROVALS` — executor pre-flight guard in UI
- `MEMBER_NOT_AUTHORIZED` — signer was removed from Squads mid-session; logout
- `TX_MESSAGE_CHANGED` — should not occur with our static vault_transaction shape; indicates bug

**D. License / gatekeeper errors**
- `LICENSE_EXPIRED` — `now > expires_at`; operator needs fresh proposal cycle
- `LICENSE_CONSUMED` — double-execute attempt; abort + log (indicates client bug or replay)
- `LICENSE_PAYLOAD_MISMATCH` — invariants passed to `execute_with_license` do not hash to license.payload_hash; client bug
- `LICENSE_NOT_FOUND` — PDA does not exist; Squads tx may not yet be confirmed; poll + surface hint
- `NOT_OPERATOR` — wallet is not the registered operator; UI gate

**E. Network / infra errors**
- `RPC_TIMEOUT` — fallback to secondary RPC
- `WALLET_DISCONNECTED` — snapshot in-memory state; offer "resume"
- `NETWORK_OFFLINE` — persistent banner; pause operations
- `BLOCKHASH_EXPIRED` — regenerate blockhash + retry (inside the same 3× loop as `ROOT_STALE`)
- `TX_SIMULATION_FAILED` — Anchor `.simulate()` pre-flight; early abort with detailed reason
- `COMPUTE_LIMIT_EXCEEDED` — tx exceeded 1.4M CU; indicates we under-budgeted; abort + alert (architectural bug)

### Recovery patterns

**Pattern 1 — Auto-retry (transparent to user)**:
```ts
for (let attempt = 0; attempt < 3; attempt++) {
  const { blockhash } = await connection.getLatestBlockhash("finalized");
  const root = await sdk.getCurrentRoot();
  const merklePath = await sdk.getMerkleProof(invariants.nullifier);
  const proofBundle = await sdk.generateProof({ ...invariants, root, merklePath });

  try {
    return await program.methods
      .executeWithLicense(invariants, proofBundle)
      .transaction()
      .then(tx => {
        tx.recentBlockhash = blockhash;
        // + ComputeBudget setComputeUnitLimit(1_400_000)
        // + ComputeBudget setComputeUnitPrice(dynamicPriorityFee)
        return connection.sendTransaction(tx);
      });
  } catch (e) {
    if ((isRootStaleError(e) || isBlockhashExpiredError(e)) && attempt < 2) {
      await sdk.waitForRoot(root, { timeoutMs: 5000 });
      continue;
    }
    throw e;
  }
}
```

**Pattern 2 — License expired without execution**: UI surfaces "expired licenses" in a reopen queue; one-click creates a fresh Squads proposal with the same recipient/amount invariants.

**Pattern 3 — Batch partial failure**: "Replan from step N" — licenses N..M are abandoned (auto-close after TTL), new Squads proposal for the remaining recipients based on current pool state.

### Mandatory transaction configuration

Every `execute_with_license` transaction includes:
```ts
const tx = new Transaction()
  .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
  .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: dynamicPriorityFee }))
  .add(executeWithLicenseIx);
```

Rationale: Cloak Groth16 verification is compute-heavy (estimated 400–800k CU). Default of 200k/ix is insufficient. Priority fee improves inclusion speed, reducing race with concurrent pool activity.

---

## Testing Strategy

### Tri-layer environment architecture

Cloak is **confirmed mainnet-only** (verified 2026-04-24 via RPC: `getAccountInfo` on the Cloak program returns `null` on devnet). We adopt a three-layer environment strategy:

**Layer 1 — Localnet + `cloak-mock` stub program**
- Custom Anchor program at `programs/cloak-mock/` — matches Cloak's instruction surface (discriminators, account shape, event format) but skips ZK verification.
- Used for: CI unit and integration tests, fast iteration cycles.
- Cost: zero. Speed: sub-second tests.

**Layer 2 — Devnet with `cloak-mock` deployed**
- Full frontend + Squads v4 + our gatekeeper + `cloak-mock`.
- Used for: end-to-end smoke testing, Playwright E2E, multi-device testing with real wallets.
- Cost: free (devnet airdrop).

**Layer 3 — Mainnet with real Cloak**
- Final pre-submission verification.
- Demo treasury pre-funded with ~0.01 SOL + 0.1 USDC.
- Used for: video recording, live URL for judges, real proof-of-work.
- Estimated cost: $5–20 in gas.

### Test layers

- **L1 Unit (Vitest + `anchor-bankrun`/LiteSVM)**: critical-path coverage on `@cloak-squads/core` (hashing, derivations, encoding) and all gatekeeper instructions.
- **L2 Integration (devnet via `cloak-mock` + mainnet for final)**: 6 E2E scenarios covering F1 happy + root-stale, F2 batch of 3, F3 audit panel + CSV export, F4 stealth claim end-to-end, multi-device signer verification, emergency close.
- **L3 Property-based (fast-check / proptest)**: payload hash determinism, master seed stability, Ed25519→X25519 round-trip. *(Cut if timeline tight.)*
- **L4 Frontend E2E (Playwright)**: wallet connect mocking, proposal flow, commitment check UI. *(Cut; replace with documented manual script.)*
- **L5 Security review checklist (1 day, obligatory)**:
  - [ ] Spend key never persists beyond session memory (verify via devtools inspection)
  - [ ] URL fragments don't appear in Network tab
  - [ ] Operator key rotation exercised
  - [ ] Logs never leak view key or spend key
  - [ ] `checked_add` / `checked_mul` in all arithmetic
  - [ ] Zero `.unwrap()` in production Rust code
  - [ ] CPI target program ID validated in `execute_with_license`
  - [ ] PDA seeds unique per entity (multisig-scoped)
  - [ ] Anchor `init` used for all account creation (prevents reinit)
  - [ ] Bumps stored in account data, not recomputed
  - [ ] CSV export sanitizes filenames (path traversal / XSS)

### Observability

- Frontend: `debug: true` in `CloakSDK` for dev console; toggle dev-only
- Backend: Pino structured logs; zero sensitive payload content
- On-chain: two events
  - `LicenseIssued { cofre, payload_hash, expires_at }`
  - `LicenseConsumed { cofre, payload_hash, cloak_signature }`

---

## Repository Structure (monorepo, pnpm + Turborepo)

```
cloak-squads/
├── README.md                         # primary submission entrypoint
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── DEMO.md
│   └── superpowers/specs/            # this file + future specs
├── programs/
│   ├── cloak-gatekeeper/             # Anchor, our primary program
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── state.rs              # Cofre, License, ViewKeyDistribution
│   │       ├── instructions/
│   │       ├── errors.rs
│   │       ├── events.rs
│   │       └── utils.rs
│   └── cloak-mock/                   # stub Cloak for dev/test
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── stub_transact.rs
│           ├── stub_deposit.rs
│           ├── stub_withdraw.rs
│           └── stub_swap.rs
├── packages/
│   ├── core/                         # @cloak-squads/core
│   │   └── src/
│   │       ├── derivation.ts         # master_seed, HKDF, Ed25519↔X25519
│   │       ├── hashing.ts            # payload_hash, diversifier
│   │       ├── encoding.ts           # canonical byte concat
│   │       ├── view-key.ts           # distribution encrypt/decrypt
│   │       ├── commitment.ts         # recompute + verify
│   │       ├── audit.ts              # scoped key derivation
│   │       ├── squads-adapter.ts     # build vault_transaction
│   │       └── gatekeeper-client.ts  # Anchor client wrapper
│   └── program-types/                # auto-generated from anchor build
├── apps/
│   └── web/                          # Next.js 15 App Router
│       ├── app/
│       │   ├── cofre/[multisig]/
│       │   │   ├── page.tsx          # dashboard
│       │   │   ├── send/             # F1
│       │   │   ├── payroll/          # F2
│       │   │   ├── invoice/          # F4 create
│       │   │   ├── audit/            # F3 admin
│       │   │   └── proposals/[id]/   # signer approval
│       │   ├── audit/[id]/           # F3.5 auditor read-only
│       │   ├── claim/[stealthId]/    # F4 recipient claim
│       │   └── api/                  # audit-links, stealth
│       ├── components/ui/            # shadcn/ui
│       ├── lib/
│       └── prisma/schema.prisma
├── scripts/
│   ├── deploy-gatekeeper.ts
│   ├── setup-demo-cofre.ts
│   ├── seed-test-data.ts
│   └── compliance-export.ts
└── tests/                            # cross-workspace integration
    ├── integration/
    └── helpers/
```

### Stack

**Frontend**: Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Framer Motion + `@solana/wallet-adapter-react` + Zustand + TanStack Query

**On-chain**: Anchor 0.30.1 + Solana 2.x + Rust 1.80+

**SDKs**: `@cloak.dev/sdk ^0.1.4` + `@sqds/multisig` (v4, pin exact version on day 1) + `@solana/web3.js ^1.98` + `@solana/spl-token ^0.4.14` + `@coral-xyz/anchor ^0.32` + `@noble/hashes ^1.8` + `tweetnacl` + `ed25519-to-x25519`

**Backend**: Next.js API routes + Prisma + SQLite (dev) / Postgres (optional prod) + Pino + jose (JWT)

**Testing**: Vitest + `solana-bankrun` / LiteSVM + Playwright (optional)

**DevEx**: pnpm 9 + Turborepo 2 + Biome + Changesets

**CI/Deploy**: GitHub Actions (`ci.yml`, `deploy-web.yml`) + Vercel (frontend) + Anchor CLI (program, manual)

---

## Timeline (20 days: 2026-04-24 → 2026-05-13)

### Phase 0 — Technical spikes (days 1–3)

| Day | Date | Deliverable |
|---|---|---|
| 1 | Thu Apr 24 | Scaffold monorepo; `anchor init` for `cloak-gatekeeper` and `cloak-mock` |
| 2 | Fri Apr 25 | `cloak-mock` complete with all stub instructions; localnet CPI test gatekeeper → mock |
| 3 | Sat Apr 26 | Squads v4 `vault_transaction_execute` → `issue_license` flow working on devnet with mock |

**If spikes fail**: fallback to simplified "admin-only execution without Squads gating" for V1, document as limitation.

### Phase 1 — Core F1 happy path (days 4–8)

| Day | Deliverable |
|---|---|
| 4 | `cloak-gatekeeper` complete with all 10 instructions + LiteSVM tests |
| 5 | `@cloak-squads/core`: derivations, hashing, view-key distribution, commitment verification + vitest suite |
| 6 | `apps/web` skeleton: wallet connect, cofre picker, dashboard w/ `scanTransactions` |
| 7 | F1 Execute Private end-to-end on devnet (mock); commitment check active |
| 8 | **Milestone**: F1 demo recordable. 2-min informal capture. |

### Phase 2 — F2 + F3 + F3.5 (days 9–13)

| Day | Deliverable |
|---|---|
| 9 | F2 CSV uploader + multi-license batch in one Squads proposal |
| 10 | F2 chained execution + retry/replan UX |
| 11 | F3 Audit Access: issue scoped viewing keys, admin panel |
| 12 | F3.5 Audit Link: URL fragment + JWT + read-only panel + CSV export |
| 13 | **Milestone**: "CFO pays payroll + issues audit link for accountant" works end-to-end |

### Phase 3 — F4 + polish + mainnet (days 14–17)

| Day | Deliverable |
|---|---|
| 14 | F4 Stealth Invoicing: create flow + claim page |
| 15 | F4 claim flow with stealth SOL dust for gas |
| 16 | Full error state UI (all 17 error codes) + loading animations |
| 17 | **Deploy mainnet** (gatekeeper + Vercel frontend) + demo cofre funded + seed data |

### Phase 4 — Deliverables + submission (days 18–20)

| Day | Deliverable |
|---|---|
| 18 | Security review L5 checklist complete; all P0/P1 resolved or documented |
| 19 | README + ARCHITECTURE + SECURITY + DEMO docs; setup tested by outsider |
| 20 | **Morning**: video recording (< 5 min) + editing. **Afternoon**: submit to Superteam Earn + Colosseum Arena. **Buffer**: description polish. |

**Day 21 (Thu May 14)**: announcement day. Already submitted Tuesday afternoon.

### Weekly checkpoints

- **Sun Apr 27** — end of week 1. Phase 0 + Phase 1 started? If not: cut F4.
- **Sun May 4** — end of week 2. Phase 2 complete? If not: reduce F2 cap to 3 recipients and eliminate F4.
- **Sun May 11** — end of week 3. Phase 3 complete? If not: freeze, begin submission.

### Priority cuts under time pressure

1. **Never cut**: F1, F3 Audit Access + CSV export, mainnet deploy, README, video, submission.
2. **May shrink**: F2 cap 10 → 5 → 3 recipients.
3. **May drop**: F4 Stealth Invoicing entirely (documents as roadmap).
4. **May defer**: L3/L4 tests, Framer Motion animations, on-chain audit revocation (falls back to client-side-only).

**Absolute non-negotiable**: video delivered, submission filed. If by May 12 no video, **stop development** and record with what exists.

---

## Submission Deliverables (Cloak Track requirements)

- [ ] Working live URL deployed (Vercel)
- [ ] Public GitHub repository with all code
- [ ] `README.md` covering: problem + target user, how Cloak SDK is used and why it's central, setup/run instructions, deployed program IDs, frontend URL
- [ ] Demo video < 5 min showing end-to-end private payment flow, explaining decisions
- [ ] Submission to Superteam Earn portal
- [ ] Submission to Colosseum Frontier Hackathon at arena.colosseum.org

---

## Open Questions (for Cloak team, non-blocking)

1. Are there known rate limits on `https://api.cloak.ag` (relayer)?
2. Is there a public devnet deployment planned before 2026-05-14?
3. Do batch / multi-recipient `send()` calls benefit from relayer-side optimization vs client-side chained `transact()`?
4. Recommended compute-unit budget for `cloak::transact` on mainnet (we're sizing for 400–800k; confirmation helps).

These are optional inputs; the design does not block on them.

---

## Future Work (V2 Roadmap)

- **Shamir secret sharing** of operator spend key (cryptographic threshold)
- **`ovk` outgoing view key** integration once exposed by Cloak SDK
- **Address Lookup Tables** for batch > 10 recipients
- **On-chain Merkle fallback** (`buildMerkleTreeFromChain`) for trust-minimized deployments
- **Orca private swap** feature (F5)
- **HSM / hardware wallet** support for operator key
- **Mobile claim flow** (F4 optimized for mobile wallets)
- **Programmatic API** for treasury automation tools to integrate

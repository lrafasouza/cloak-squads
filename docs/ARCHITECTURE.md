# Architecture

## System Overview

Cloak Squads is a private execution layer for Squads v4 multisig vaults. It adds a gatekeeper between the Squads vault and the Cloak privacy protocol, enforcing that only licensed, operator-gated transfers execute.

## Program Architecture

### Squads v4 (External)

Manages multisig state: members, threshold, proposals, and vault PDAs. The vault PDA acts as an inner signer when executing transactions — this is how the gatekeeper verifies the call originates from an authorized Squads vault.

### cloak-gatekeeper

Deployed at `WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J` (devnet).

The gatekeeper is an Anchor program with 10 instructions:

| Instruction | Purpose |
|-------------|---------|
| `init_cofre` | Initialize cofre account (multisig, operator, view key) |
| `issue_license` | Create a time-limited execution license with payload hash |
| `execute_with_license` | Operator consumes license, CPIs into Cloak |
| `init_view_distribution` | Set up encrypted view key distribution |
| `add_signer_view` | Add a signer to the view distribution |
| `remove_signer_view` | Remove a signer from the view distribution |
| `close_expired_license` | Reclaim rent from expired licenses |
| `emergency_close_license` | Operator can close any license |
| `revoke_audit` | Revoke a diversifier-based audit key |
| `set_operator` | Rotate the operator wallet |

**Key accounts:**

- **Cofre** — One per multisig. Stores `multisig`, `operator`, `view_key_public`, `created_at`.
- **License** — One per execution. Stores `cofre`, `payload_hash`, `nonce`, `ttl`, `status` (Active/Consumed), `issued_at`, `expires_at`.

**Execution flow:**

```
Squads vaultTransactionExecute
  └─▶ gatekeeper::issue_license (via CPI)
        └─▶ Creates License account with payload hash + TTL

Operator wallet sends transaction:
  ├─▶ cloakDeposit() — Real deposit into Cloak shield pool
  │     ├─▶ Generate UTXO keypair + blinding
  │     ├─▶ Call transact() with zero inputs (deposit)
  │     └─▶ Store UTXO data for future claim
  └─▶ gatekeeper::execute_with_license
        ├─▶ Verify operator identity
        ├─▶ Verify license not expired / not consumed
        ├─▶ Verify payload hash matches license
        └─▶ CPI into Cloak program (real proofs)
              ├─▶ Record nullifier
              └─▶ Update pool merkle root
```

### cloak-mock

Deployed at `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe` (devnet).

Stubs the real Cloak program. Accepts `stub_transact(nullifier, commitment, amount, token_mint, recipient_vk_pub, nonce, proof_bytes, merkle_root)` — proof and merkle root are ignored. Records the nullifier to prevent double-spend and XORs commitment into a stub merkle root.

## Frontend Architecture

```
apps/web/
├── app/
│   ├── page.tsx                          # Landing — enter multisig address
│   ├── cofre/[multisig]/
│   │   ├── page.tsx                      # Dashboard — drafts list, addresses, stats
│   │   ├── send/page.tsx                 # Create proposal with UTXO commitment
│   │   ├── payroll/page.tsx              # Batch payroll with multiple recipients
│   │   ├── operator/page.tsx             # Execute with license + cloakDeposit()
│   │   └── proposals/[id]/page.tsx       # View/approve/execute proposal
│   ├── claim/[stealthId]/page.tsx        # Claim stealth invoice via fullWithdraw()
│   ├── audit/[linkId]/page.tsx           # Public audit view with Cloak scan
│   └── api/                              # REST API (Prisma + SQLite)
├── components/
│   ├── proposal/                         # ApprovalButtons, ExecuteButton, CommitmentCheck
│   ├── proof/                            # ProofGenerationState (visual stepper)
│   ├── wallet/                           # WalletProviders, ClientWalletButton
│   └── ui/                               # shadcn/ui primitives
├── lib/
│   ├── prisma.ts                         # Prisma client singleton
│   ├── serialize-proposal-draft.ts       # Shared serializer
│   ├── init-commitment.ts                # Registers computeUtxoCommitment from Cloak SDK
│   ├── gatekeeper-instructions.ts        # Manual ix builders (bypasses Anchor Program)
│   ├── squads-sdk.ts                     # Squads proposal creation helpers
│   ├── payroll-csv.ts                    # CSV parsing for batch payroll
│   ├── env.ts                            # Zod-validated env vars
│   └── idl/cloak_gatekeeper.json         # Anchor IDL for account deserialization
└── prisma/
    └── schema.prisma                     # ProposalDraft, PayrollDraft, AuditLink, StealthInvoice
```

### Data Flow — Create Proposal

```
User fills form → generate UTXO keypair + blinding via Cloak SDK
  → computeUtxoCommitment(utxo) → commitment
  → computePayloadHash(SHA256 of invariants)
  → buildIssueLicenseIxBrowser (manual serialization)
  → createIssueLicenseProposal (Squads vaultTransactionCreate + proposalCreate)
  → POST /api/proposals (persist draft to SQLite, no secrets)
  → sessionStorage.setItem(claim with keypair, blinding, tokenMint)
  → redirect to proposal page
```

### Data Flow — Approve + Execute

```
Proposal page loads:
  → GET /api/proposals/{multisig}/{index} (draft from SQLite)
  → sessionStorage.getItem(claim) (secrets, browser-only)
  → Multisig.fromAccountAddress (fetch threshold)
  → Proposal.fromAccountAddress (fetch status + approvals)
  → recomputeCommitment (via registered Cloak SDK function)

User clicks Approve:
  → proposalApprove instruction → Squads processes vote
  → Poll status every 3s until approved

User clicks Execute:
  → vaultTransactionExecute instruction → Squads CPIs into gatekeeper::issue_license
```

### Data Flow — Operator Execute

```
Operator page loads:
  → BorshAccountsCoder.decode("cofre") → fetch registered operator
  → Verify connected wallet matches operator

User clicks Execute:
  → Load draft from GET /api/proposals/{multisig}/{index}
  → cloakDeposit() — Real deposit into Cloak shield pool
        ├─▶ Generate UTXO keypair + blinding
        ├─▶ Call transact() with zero inputs (deposit)
        └─▶ Store UTXO data via PATCH /api/stealth/{id}/utxo
  → Build execute_with_license ix with real proof from Cloak SDK
  → ComputeBudgetProgram.setComputeUnitLimit(1.4M CU) + priority fee
  → sendTransaction → gatekeeper CPIs into Cloak program
```

## Shared Package (`@cloak-squads/core`)

| Module | Purpose |
|--------|---------|
| `types.ts` | `PayloadInvariants`, `AuditDiversifierInput` |
| `encoding.ts` | LE u64 encoding, pubkey-to-bytes, domain separators |
| `hashing.ts` | `computePayloadHash` (SHA-256), `computeAuditDiversifier` (BLAKE3) |
| `pda.ts` | `cofrePda`, `licensePda`, `squadsVaultPda`, `gatekeeperProgramPda` |
| `commitment.ts` | `recomputeCommitment` (DI-registered compute fn), `commitmentsEqual` |
| `squads-adapter.ts` | Squads PDA utilities |
| `gatekeeper-client.ts` | Anchor-based ix builders (unused by web app, used by scripts) |
| `view-key.ts` | nacl.box encryption/decryption for view key distribution |

## Persistence

SQLite via Prisma with four models:

| Model | Purpose | API Routes |
|-------|---------|-----------|
| `ProposalDraft` | Stores proposal metadata (amount, recipient, invariants, payload hash, commitment claim) | 3 routes (POST, GET list, GET single) |
| `PayrollDraft` | Batch payroll with multiple recipients | 3 routes (POST, GET list, GET single) |
| `AuditLink` | Audit admin diversifier records with signature verification | 2 routes (POST, GET) |
| `StealthInvoice` | Stealth invoice metadata + UTXO data for claim | 3 routes (POST, GET list, PATCH UTXO, POST claim) |

**Security note:** `commitmentClaim` secrets (keypair, blinding) are stored in `sessionStorage` only — never sent to the server. UTXO data for stealth invoices is stored server-side (required for `fullWithdraw` claim flow).

## Testing

| Test | Scope | Runner |
|------|-------|--------|
| `spike-cpi.test.ts` | Gatekeeper → mock CPI (3-level deep) | anchor-bankrun |
| `gatekeeper-instructions.test.ts` | All 10 instructions + 12 error cases | anchor-bankrun |
| `f1-send.test.ts` | Full F1 flow: cofre → license → execute → verify | anchor-bankrun |
| `f1-e2e-devnet.ts` | Full F1 flow on devnet (real transactions) | tsx script |

## Devnet Integration

The Cloak devnet SDK (`@cloak.dev/sdk-devnet@0.1.5-devnet.0`) had a broken `deposit()` that built a legacy instruction format rejected by the devnet program. **This has been resolved** by calling `transact()` directly with zero inputs (pure deposit pattern), as endorsed by the Cloak team. See `packages/core/src/cloak-deposit.ts` for the implementation.

**Status:** Real Cloak deposits and withdrawals are working on devnet via the `transact()` unified instruction (disc-0).

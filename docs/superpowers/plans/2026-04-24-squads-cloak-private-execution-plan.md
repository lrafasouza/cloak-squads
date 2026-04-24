# cloak-squads Private Execution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production Squads v4 module that executes private payments, batch payroll, scoped audit access, and stealth invoices via the Cloak shielded pool — deployed on mainnet with demo treasury, ready for Cloak Track submission by 2026-05-13.

**Architecture:** Monorepo (pnpm + Turborepo). Two Anchor programs: `cloak-gatekeeper` (production) + `cloak-mock` (dev/test stub). Next.js 15 frontend with browser-side snarkjs proving, Squads v4 SDK integration, and Cloak SDK for shielded pool operations. 2-transaction execution pattern (license + execute) to handle Merkle root staleness. Operator-gated V1 security model with deterministic view-key derivation + encrypted distribution.

**Tech Stack:** pnpm 9, Turborepo 2, Next.js 15 (App Router), TypeScript strict, Tailwind v4, shadcn/ui, Framer Motion, `@solana/wallet-adapter-react`, Zustand, TanStack Query, Prisma + SQLite, Pino. Anchor 0.30.1, Rust 1.80, Solana/Agave 1.18.x for the Anchor program toolchain. `@cloak.dev/sdk ^0.1.4`, `@sqds/multisig` (v4), `@solana/web3.js ^1.98`, `@coral-xyz/anchor 0.30.x`, `@noble/hashes`, `tweetnacl`, `ed25519-to-x25519`. Vitest + `solana-bankrun`/LiteSVM. Biome linter.

**Spec reference:** `docs/superpowers/specs/2026-04-24-squads-cloak-private-execution-design.md`

**Priority legend:**
- **P0** — Never cut. Ship blocker.
- **P1** — May reduce/defer (e.g. batch cap drops).
- **P2** — May drop entirely (documented as roadmap).

---

## File Structure Map

```
cloak-squads/                                    (root)
├── package.json                                  [P0] root workspace + scripts
├── pnpm-workspace.yaml                           [P0]
├── turbo.json                                    [P0]
├── tsconfig.base.json                            [P0] shared strict TS config
├── biome.json                                    [P0] lint/format config
├── .env.example                                  [P0] env template
├── .gitignore                                    [P0]
├── README.md                                     [P0] submission entrypoint
│
├── docs/
│   ├── ARCHITECTURE.md                           [P0] link to spec + diagrams
│   ├── SECURITY.md                               [P0] V1 model + V2 roadmap
│   ├── DEMO.md                                   [P0] judge reproduction script
│   ├── superpowers/
│   │   ├── specs/2026-04-24-*.md                 [✓ exists]
│   │   └── plans/2026-04-24-*.md                 [✓ this file]
│
├── programs/
│   ├── cloak-gatekeeper/                         [P0]
│   │   ├── Anchor.toml
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                            entry + program declarations
│   │       ├── state.rs                          Cofre, ViewKeyDistribution, License
│   │       ├── errors.rs                         CloakSquadsError enum
│   │       ├── events.rs                         LicenseIssued, LicenseConsumed
│   │       ├── utils.rs                          hash_payload, verify_squads_signer
│   │       └── instructions/
│   │           ├── mod.rs
│   │           ├── init_cofre.rs
│   │           ├── init_view_distribution.rs
│   │           ├── add_signer_view.rs
│   │           ├── remove_signer_view.rs
│   │           ├── issue_license.rs
│   │           ├── execute_with_license.rs
│   │           ├── close_expired_license.rs
│   │           ├── emergency_close_license.rs
│   │           ├── revoke_audit.rs
│   │           └── set_operator.rs
│   └── cloak-mock/                               [P0] stub for dev/test
│       ├── Anchor.toml
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── state.rs                          StubPool, NullifierSet
│           └── instructions/
│               ├── mod.rs
│               ├── init_pool.rs
│               ├── stub_transact.rs
│               ├── stub_deposit.rs
│               ├── stub_withdraw.rs
│               └── stub_swap.rs
│
├── packages/
│   ├── core/                                     [P0] @cloak-squads/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                          public exports
│   │   │   ├── derivation.ts                     master_seed, HKDF, Ed25519↔X25519
│   │   │   ├── hashing.ts                        payload_hash, diversifier
│   │   │   ├── encoding.ts                       canonical byte concat helpers
│   │   │   ├── view-key.ts                       distribution encrypt/decrypt
│   │   │   ├── commitment.ts                     recompute + verify
│   │   │   ├── audit.ts                          scoped viewing key derivation
│   │   │   ├── squads-adapter.ts                 build vault_transaction
│   │   │   ├── gatekeeper-client.ts              Anchor program wrapper
│   │   │   └── types.ts                          shared types
│   │   └── tests/
│   │       ├── derivation.test.ts
│   │       ├── hashing.test.ts
│   │       ├── view-key.test.ts
│   │       ├── commitment.test.ts
│   │       └── audit.test.ts
│   └── program-types/                            [P0] auto-generated by anchor
│       └── src/{idl.json,types.ts}
│
├── apps/
│   └── web/                                      [P0]
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── app/
│       │   ├── layout.tsx                        wallet provider, query client
│       │   ├── page.tsx                          landing + cofre picker
│       │   ├── cofre/[multisig]/
│       │   │   ├── layout.tsx                    cofre context provider
│       │   │   ├── page.tsx                      dashboard + balance
│       │   │   ├── send/page.tsx                 [P0] F1
│       │   │   ├── payroll/page.tsx              [P1] F2
│       │   │   ├── invoice/page.tsx              [P2] F4 create
│       │   │   ├── audit/page.tsx                [P0] F3 admin
│       │   │   └── proposals/[id]/page.tsx       signer approval view
│       │   ├── audit/[id]/page.tsx               [P0] F3.5 auditor
│       │   ├── claim/[stealthId]/page.tsx        [P2] F4 recipient
│       │   └── api/
│       │       ├── audit-links/
│       │       │   ├── route.ts                  POST create, GET list
│       │       │   └── [id]/route.ts             GET/DELETE one
│       │       └── stealth/
│       │           ├── route.ts                  POST create
│       │           └── [id]/route.ts             GET one
│       ├── components/
│       │   ├── ui/                               shadcn primitives
│       │   ├── wallet/
│       │   │   └── ConnectButton.tsx
│       │   ├── cofre/
│       │   │   ├── CofrePicker.tsx
│       │   │   ├── Balance.tsx
│       │   │   └── ActivityFeed.tsx
│       │   ├── proof/
│       │   │   └── ProofGenerationState.tsx      visual spinner + step description
│       │   ├── proposal/
│       │   │   ├── ProposalCard.tsx
│       │   │   ├── CommitmentCheck.tsx           [P0] signer verification UI
│       │   │   └── ApprovalButtons.tsx
│       │   └── audit/
│       │       ├── AuditLinkPanel.tsx
│       │       └── CsvExport.tsx
│       ├── lib/
│       │   ├── wallet-adapter.ts
│       │   ├── cloak-sdk.ts                      SDK init + config
│       │   ├── squads-sdk.ts                     Squads v4 init
│       │   ├── session-cache.ts                  sessionStorage helpers
│       │   ├── env.ts                            typed env var access
│       │   └── prisma.ts                         Prisma client singleton
│       ├── prisma/
│       │   ├── schema.prisma                     AuditLink, StealthInvoice
│       │   └── migrations/
│       ├── public/
│       │   └── circuits/                         Cloak circuit files (fetched)
│       └── tsconfig.json
│
├── scripts/                                      [P0]
│   ├── deploy-gatekeeper.ts                      deploy to devnet/mainnet
│   ├── deploy-cloak-mock.ts                      deploy mock to devnet
│   ├── setup-demo-cofre.ts                       initialize demo treasury
│   ├── seed-test-data.ts                         populate dev state
│   └── compliance-export.ts                      CLI CSV export tool
│
└── tests/                                        [P0]
    ├── integration/
    │   ├── f1-send.test.ts
    │   ├── f2-batch.test.ts
    │   ├── f3-audit.test.ts
    │   ├── f4-stealth.test.ts
    │   └── e2e-full-flow.test.ts                 [P0] one end-to-end
    └── helpers/
        ├── fixtures.ts                           test keypairs, pre-funded
        ├── devnet-setup.ts                       deploy + init helpers
        └── squads-helpers.ts                     create test multisig
```

---

## Phase 0 — Technical Spikes (Days 1–3: Apr 24–26)

**Goal of phase:** De-risk the three hardest architectural assumptions before writing any product code. If spike fails, fall back to simpler V1 and document limitation.

**Review checkpoint at end of Phase 0:**
- [ ] Does CPI depth fit? (verified via actual tx on devnet)
- [ ] Does Squads v4 vault_transaction reach our gatekeeper with vault PDA as signer?
- [ ] Does license+execute 2-tx pattern work end-to-end?
- [ ] Is `@sqds/multisig` latest version stable? (pin exact version in root package.json)
- [ ] Are Cloak SDK exports used by the plan (`generateCloakKeys`, `computeCommitment`, `deriveDiversifiedViewingKey`, `scanTransactions`, CSV helpers) verified against the installed SDK package before frontend work starts?

---

### Task 0.1: Initialize monorepo scaffold [P0, Day 1]

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `biome.json`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "cloak-squads",
  "version": "0.0.1",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:int": "turbo run test:int",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "turbo run typecheck",
    "anchor:build": "cd programs/cloak-gatekeeper && anchor build && cd ../cloak-mock && anchor build",
    "anchor:deploy:devnet": "tsx scripts/deploy-gatekeeper.ts --cluster devnet && tsx scripts/deploy-cloak-mock.ts --cluster devnet",
    "anchor:deploy:mainnet": "tsx scripts/deploy-gatekeeper.ts --cluster mainnet",
    "demo:setup": "tsx scripts/setup-demo-cofre.ts",
    "demo:seed": "tsx scripts/seed-test-data.ts"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "turbo": "^2.3.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":      { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "test":       { "dependsOn": ["build"] },
    "test:unit":  { "dependsOn": ["build"] },
    "test:int":   { "dependsOn": ["build"] },
    "typecheck":  { "dependsOn": ["^build"] },
    "dev":        { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "paths": {
      "@cloak-squads/core": ["./packages/core/src"],
      "@cloak-squads/core/*": ["./packages/core/src/*"]
    }
  }
}
```

- [ ] **Step 5: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 }
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
.next/
dist/
target/
.turbo/
*.log
.env
.env.local
test-ledger/
.anchor/
.vercel/
prisma/dev.db*
```

- [ ] **Step 7: Create .env.example**

```
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
FALLBACK_RPC_URL=https://api.devnet.solana.com

NEXT_PUBLIC_CLOAK_PROGRAM_ID=zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW
NEXT_PUBLIC_CLOAK_RELAY_URL=https://api.cloak.ag
NEXT_PUBLIC_CLOAK_CIRCUITS_URL=

NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID=
NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=
NEXT_PUBLIC_SQUADS_PROGRAM_ID=SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf

DATABASE_URL=file:./dev.db
JWT_SIGNING_SECRET=dev-secret-replace-in-prod
LOG_LEVEL=debug
```

- [ ] **Step 8: Install deps and initialize git**

Run: `pnpm install && git add -A && git commit -m "chore: bootstrap monorepo scaffold"`
Expected: clean install, initial commit created.

---

### Task 0.2: Initialize `cloak-gatekeeper` Anchor program skeleton [P0, Day 1]

**Files:**
- Create: `programs/cloak-gatekeeper/Anchor.toml`, `Cargo.toml`, `src/lib.rs`, `src/state.rs`, `src/errors.rs`, `src/events.rs`

- [ ] **Step 1: Scaffold with anchor init**

Run: `cd programs && anchor init cloak-gatekeeper --no-git && cd cloak-gatekeeper && rm -rf tests app migrations`
Expected: Anchor skeleton created.

- [ ] **Step 2: Update Cargo.toml with exact deps**

```toml
[package]
name = "cloak-gatekeeper"
version = "0.1.0"
description = "Squads-gated private execution module for Cloak shielded pool"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "cloak_gatekeeper"

[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
idl-build = ["anchor-lang/idl-build"]

[dependencies]
anchor-lang = { version = "0.30.1", features = ["init-if-needed"] }
solana-program = "~1.18"
```

- [ ] **Step 3: Write src/errors.rs**

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum CloakSquadsError {
    #[msg("Signer is not the Squads vault PDA for this cofre")]
    InvalidSquadsSigner,
    #[msg("Caller is not the registered operator")]
    NotOperator,
    #[msg("License has expired")]
    LicenseExpired,
    #[msg("License has already been consumed")]
    LicenseConsumed,
    #[msg("Payload invariants do not match license hash")]
    LicensePayloadMismatch,
    #[msg("Invalid payload nonce length")]
    InvalidNonce,
    #[msg("CPI target is not the configured Cloak program")]
    InvalidCpiTarget,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Revoked audit diversifier collision detected")]
    RevocationCollision,
    #[msg("Too many revocations — realloc required by caller")]
    RevocationCapacity,
}
```

- [ ] **Step 4: Write src/events.rs**

```rust
use anchor_lang::prelude::*;

#[event]
pub struct LicenseIssued {
    pub cofre: Pubkey,
    pub payload_hash: [u8; 32],
    pub expires_at: i64,
}

#[event]
pub struct LicenseConsumed {
    pub cofre: Pubkey,
    pub payload_hash: [u8; 32],
    pub cloak_tx_signature_hint: [u8; 32], // first 32 bytes of sig, opaque hint
}

#[event]
pub struct CofreInitialized {
    pub cofre: Pubkey,
    pub multisig: Pubkey,
    pub operator: Pubkey,
}
```

- [ ] **Step 5: Write src/state.rs with placeholder structs**

```rust
use anchor_lang::prelude::*;

#[account]
pub struct Cofre {
    pub multisig: Pubkey,
    pub operator: Pubkey,
    pub view_key_public: [u8; 32],
    pub created_at: i64,
    pub version: u8,
    pub revoked_audit: Vec<[u8; 16]>,
    pub bump: u8,
}

impl Cofre {
    pub const MAX_REVOKED: usize = 256; // practical cap before realloc
    pub fn space(revoked_count: usize) -> usize {
        8 + 32 + 32 + 32 + 8 + 1 + 4 + (16 * revoked_count) + 1
    }
    pub const INIT_SPACE: usize = Self::space(0);
}

#[account]
pub struct ViewKeyDistribution {
    pub cofre: Pubkey,
    pub entries: Vec<EncryptedViewKey>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EncryptedViewKey {
    pub signer: Pubkey,
    pub ephemeral_pk: [u8; 32],
    pub nonce: [u8; 24],
    pub ciphertext: [u8; 48],
    pub added_at: i64,
}

impl EncryptedViewKey {
    pub const SPACE: usize = 32 + 32 + 24 + 48 + 8;
}

impl ViewKeyDistribution {
    pub fn space(entries: usize) -> usize {
        8 + 32 + 4 + (entries * EncryptedViewKey::SPACE) + 1
    }
}

#[account]
pub struct License {
    pub cofre: Pubkey,
    pub payload_hash: [u8; 32],
    pub nonce: [u8; 16],
    pub issued_at: i64,
    pub expires_at: i64,
    pub status: LicenseStatus,
    pub close_authority: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum LicenseStatus {
    Active,
    Consumed,
}

impl License {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 16 + 8 + 8 + 1 + 32 + 1;
}
```

- [ ] **Step 6: Write src/lib.rs with program declaration (no instructions yet)**

```rust
use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod state;

declare_id!("GateKeep1111111111111111111111111111111111"); // placeholder, replace after build

#[program]
pub mod cloak_gatekeeper {
    use super::*;
    // instructions added in Task 0.3 onwards
}
```

- [ ] **Step 7: Build and verify**

Run: `cd programs/cloak-gatekeeper && anchor build`
Expected: `target/deploy/cloak_gatekeeper.so` created; log the real program ID with `solana address -k target/deploy/cloak_gatekeeper-keypair.json`.

- [ ] **Step 8: Update declare_id with real program ID and commit**

Replace `declare_id!` placeholder with output from previous step.

Run: `git add -A && git commit -m "feat(gatekeeper): scaffold program with state types and errors"`

---

### Task 0.3: Initialize `cloak-mock` stub program skeleton [P0, Day 1]

**Files:**
- Create: `programs/cloak-mock/Anchor.toml`, `Cargo.toml`, `src/lib.rs`, `src/state.rs`

- [ ] **Step 1: Scaffold mock program**

Run: `cd programs && anchor init cloak-mock --no-git && cd cloak-mock && rm -rf tests app migrations`

- [ ] **Step 2: Write src/state.rs**

```rust
use anchor_lang::prelude::*;

#[account]
pub struct StubPool {
    pub mint: Pubkey,
    pub merkle_root_stub: [u8; 32], // moves monotonically but not real
    pub tx_count: u64,
    pub bump: u8,
}

impl StubPool {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct NullifierRecord {
    pub nullifier: [u8; 32],
    pub consumed_at: i64,
    pub bump: u8,
}

impl NullifierRecord {
    pub const INIT_SPACE: usize = 8 + 32 + 8 + 1;
}
```

- [ ] **Step 3: Write src/lib.rs with stub instructions**

```rust
use anchor_lang::prelude::*;

pub mod state;
use state::*;

declare_id!("MockCL0ak11111111111111111111111111111111111");

#[program]
pub mod cloak_mock {
    use super::*;

    pub fn init_pool(ctx: Context<InitPool>, mint: Pubkey) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.mint = mint;
        pool.merkle_root_stub = [0u8; 32];
        pool.tx_count = 0;
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    /// Stub transact: accepts same invariants as real Cloak, records nullifier, increments root.
    pub fn stub_transact(
        ctx: Context<StubTransact>,
        nullifier: [u8; 32],
        commitment: [u8; 32],
        _amount: u64,
        _recipient_vk_pub: [u8; 32],
        _proof_bytes: [u8; 256], // opaque, ignored
        _merkle_root: [u8; 32],
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let nullifier_rec = &mut ctx.accounts.nullifier_record;
        nullifier_rec.nullifier = nullifier;
        nullifier_rec.consumed_at = Clock::get()?.unix_timestamp;
        nullifier_rec.bump = ctx.bumps.nullifier_record;
        // mutate merkle_root_stub to simulate state change (XOR with commitment)
        for i in 0..32 {
            pool.merkle_root_stub[i] ^= commitment[i];
        }
        pool.tx_count = pool.tx_count.checked_add(1).ok_or(ProgramError::ArithmeticOverflow)?;
        emit!(StubTransactEvent { nullifier, commitment });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct InitPool<'info> {
    #[account(
        init, payer = payer, space = StubPool::INIT_SPACE,
        seeds = [b"stub_pool", mint.as_ref()], bump,
    )]
    pub pool: Account<'info, StubPool>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier: [u8; 32])]
pub struct StubTransact<'info> {
    #[account(mut, seeds = [b"stub_pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, StubPool>,
    #[account(
        init, payer = payer, space = NullifierRecord::INIT_SPACE,
        seeds = [b"nullifier", nullifier.as_ref()], bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct StubTransactEvent {
    pub nullifier: [u8; 32],
    pub commitment: [u8; 32],
}
```

- [ ] **Step 4: Build and capture program ID**

Run: `cd programs/cloak-mock && anchor build`
Replace `declare_id!` with output of `solana address -k target/deploy/cloak_mock-keypair.json`.

- [ ] **Step 5: Commit**

Run: `git add -A && git commit -m "feat(mock): stub Cloak program for dev/test environments"`

---

### Task 0.4: SPIKE — CPI gatekeeper → cloak-mock in LiteSVM [P0, Day 2]

**Goal:** Verify our CPI pattern works end-to-end before building product instructions.

**Files:**
- Create: `programs/cloak-gatekeeper/src/instructions/mod.rs`, `issue_license.rs`, `execute_with_license.rs` (minimal versions)
- Create: `tests/integration/spike-cpi.test.ts`

- [ ] **Step 1: Add anchor-bankrun deps to root**

Run: `pnpm add -D -w solana-bankrun anchor-bankrun @coral-xyz/anchor @solana/web3.js`

- [ ] **Step 2: Write minimal `issue_license` instruction**

Create `programs/cloak-gatekeeper/src/instructions/issue_license.rs`:

```rust
use anchor_lang::prelude::*;
use crate::state::*;
use crate::events::LicenseIssued;
use crate::errors::CloakSquadsError;

pub fn handler(
    ctx: Context<IssueLicense>,
    payload_hash: [u8; 32],
    nonce: [u8; 16],
    ttl_secs: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let expires_at = now.checked_add(ttl_secs).ok_or(CloakSquadsError::MathOverflow)?;

    let license = &mut ctx.accounts.license;
    license.cofre = ctx.accounts.cofre.key();
    license.payload_hash = payload_hash;
    license.nonce = nonce;
    license.issued_at = now;
    license.expires_at = expires_at;
    license.status = LicenseStatus::Active;
    license.close_authority = ctx.accounts.cofre.operator;
    license.bump = ctx.bumps.license;

    emit!(LicenseIssued {
        cofre: license.cofre,
        payload_hash,
        expires_at,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct IssueLicense<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    #[account(
        init, payer = payer, space = License::INIT_SPACE,
        seeds = [b"license", cofre.key().as_ref(), payload_hash.as_ref()], bump,
    )]
    pub license: Account<'info, License>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 3: Write minimal `execute_with_license` that CPIs cloak-mock**

Create `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs`:

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use crate::state::*;
use crate::events::LicenseConsumed;
use crate::errors::CloakSquadsError;

pub const PAYLOAD_DOMAIN_SEP: &[u8] = b"cloak-squads-payload-v1\0";

pub fn hash_payload(
    nullifier: &[u8; 32],
    commitment: &[u8; 32],
    amount: u64,
    token_mint: &Pubkey,
    recipient_vk_pub: &[u8; 32],
    nonce: &[u8; 16],
) -> [u8; 32] {
    let mut buf = Vec::with_capacity(PAYLOAD_DOMAIN_SEP.len() + 32 + 32 + 8 + 32 + 32 + 16);
    buf.extend_from_slice(PAYLOAD_DOMAIN_SEP);
    buf.extend_from_slice(nullifier);
    buf.extend_from_slice(commitment);
    buf.extend_from_slice(&amount.to_le_bytes());
    buf.extend_from_slice(token_mint.as_ref());
    buf.extend_from_slice(recipient_vk_pub);
    buf.extend_from_slice(nonce);
    hash(&buf).to_bytes()
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ExecuteInvariants {
    pub nullifier: [u8; 32],
    pub commitment: [u8; 32],
    pub amount: u64,
    pub token_mint: Pubkey,
    pub recipient_vk_pub: [u8; 32],
    pub nonce: [u8; 16],
}

pub fn handler(
    ctx: Context<ExecuteWithLicense>,
    invariants: ExecuteInvariants,
    proof_bytes: [u8; 256],
    merkle_root: [u8; 32],
) -> Result<()> {
    let computed = hash_payload(
        &invariants.nullifier,
        &invariants.commitment,
        invariants.amount,
        &invariants.token_mint,
        &invariants.recipient_vk_pub,
        &invariants.nonce,
    );
    require!(computed == ctx.accounts.license.payload_hash, CloakSquadsError::LicensePayloadMismatch);
    require!(ctx.accounts.license.status == LicenseStatus::Active, CloakSquadsError::LicenseConsumed);
    let now = Clock::get()?.unix_timestamp;
    require!(now <= ctx.accounts.license.expires_at, CloakSquadsError::LicenseExpired);
    require!(ctx.accounts.operator.key() == ctx.accounts.cofre.operator, CloakSquadsError::NotOperator);

    // CPI to cloak-mock (or real cloak in prod). Shape: stub_transact discriminator + args
    let data = build_stub_transact_data(&invariants, &proof_bytes, &merkle_root);
    let cpi_accounts = vec![
        AccountMeta::new(ctx.accounts.pool.key(), false),
        AccountMeta::new(ctx.accounts.nullifier_record.key(), false),
        AccountMeta::new(ctx.accounts.operator.key(), true),
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    ];
    let ix = Instruction {
        program_id: ctx.accounts.cloak_program.key(),
        accounts: cpi_accounts,
        data,
    };
    invoke_signed(
        &ix,
        &[
            ctx.accounts.pool.to_account_info(),
            ctx.accounts.nullifier_record.to_account_info(),
            ctx.accounts.operator.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[],
    )?;

    let license = &mut ctx.accounts.license;
    license.status = LicenseStatus::Consumed;

    emit!(LicenseConsumed {
        cofre: license.cofre,
        payload_hash: license.payload_hash,
        cloak_tx_signature_hint: [0u8; 32], // filled by tx sig introspection later
    });
    Ok(())
}

fn build_stub_transact_data(
    inv: &ExecuteInvariants,
    proof_bytes: &[u8; 256],
    merkle_root: &[u8; 32],
) -> Vec<u8> {
    // Anchor discriminator for stub_transact = first 8 bytes of sha256("global:stub_transact")
    let disc: [u8; 8] = anchor_lang::solana_program::hash::hashv(&[b"global:stub_transact"]).to_bytes()[..8].try_into().unwrap();
    let mut data = Vec::with_capacity(8 + 32 + 32 + 8 + 32 + 256 + 32);
    data.extend_from_slice(&disc);
    data.extend_from_slice(&inv.nullifier);
    data.extend_from_slice(&inv.commitment);
    data.extend_from_slice(&inv.amount.to_le_bytes());
    data.extend_from_slice(&inv.recipient_vk_pub);
    data.extend_from_slice(proof_bytes);
    data.extend_from_slice(merkle_root);
    data
}

#[derive(Accounts)]
pub struct ExecuteWithLicense<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    #[account(
        mut,
        seeds = [b"license", cofre.key().as_ref(), license.payload_hash.as_ref()],
        bump = license.bump,
    )]
    pub license: Account<'info, License>,
    #[account(mut)]
    pub operator: Signer<'info>,
    /// CHECK: validated against configured Cloak program ID
    pub cloak_program: UncheckedAccount<'info>,
    /// CHECK: CPI target
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    /// CHECK: CPI target
    #[account(mut)]
    pub nullifier_record: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 4: Wire instructions in src/lib.rs**

Edit `programs/cloak-gatekeeper/src/lib.rs`:

```rust
use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("<real program id>");

#[program]
pub mod cloak_gatekeeper {
    use super::*;

    pub fn issue_license(
        ctx: Context<IssueLicense>,
        payload_hash: [u8; 32],
        nonce: [u8; 16],
        ttl_secs: i64,
    ) -> Result<()> {
        instructions::issue_license::handler(ctx, payload_hash, nonce, ttl_secs)
    }

    pub fn execute_with_license(
        ctx: Context<ExecuteWithLicense>,
        invariants: ExecuteInvariants,
        proof_bytes: [u8; 256],
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::execute_with_license::handler(ctx, invariants, proof_bytes, merkle_root)
    }
}
```

Create `programs/cloak-gatekeeper/src/instructions/mod.rs`:

```rust
pub mod issue_license;
pub mod execute_with_license;

pub use issue_license::*;
pub use execute_with_license::*;
```

- [ ] **Step 5: Build both programs**

Run: `pnpm anchor:build`
Expected: both `.so` artifacts built without warnings.

- [ ] **Step 6: Write spike integration test**

Create `tests/integration/spike-cpi.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { startAnchor } from "solana-bankrun";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { BankrunProvider } from "anchor-bankrun";
import gatekeeperIdl from "../../programs/cloak-gatekeeper/target/idl/cloak_gatekeeper.json";
import mockIdl from "../../programs/cloak-mock/target/idl/cloak_mock.json";

describe("SPIKE: gatekeeper → cloak-mock CPI", () => {
  let context: any, provider: BankrunProvider, gatekeeper: Program<any>, mock: Program<any>;

  beforeAll(async () => {
    context = await startAnchor("./", [], []);
    provider = new BankrunProvider(context);
    gatekeeper = new Program(gatekeeperIdl as any, provider);
    mock = new Program(mockIdl as any, provider);
  });

  it("issues license then consumes it via CPI to mock", async () => {
    const operator = Keypair.generate();
    const multisig = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    // Init mock pool
    const [pool] = PublicKey.findProgramAddressSync([Buffer.from("stub_pool"), mint.toBuffer()], mock.programId);
    await mock.methods.initPool(mint).accountsPartial({
      pool,
      payer: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    }).rpc();

    // INTENTIONAL SCOPE LIMIT: this first spike validates bankrun + IDL loading + mock tx execution.
    // It is NOT sufficient to clear the Phase 0 CPI-depth checkpoint by itself.
    // Before marking Task 0.4 complete, extend this file with a minimal cofre fixture and call:
    //   1. gatekeeper.issueLicense(payloadHash, nonce, ttlSecs)
    //   2. gatekeeper.executeWithLicense(invariants, proofBytes, merkleRoot)
    //   3. fetch License and assert status == Consumed
    //   4. fetch mock NullifierRecord and assert it exists
    // If minimal cofre setup is too heavy here, do not claim "CPI verified"; move that acceptance
    // criterion explicitly to Task 1.4 and document the risk in docs/spike-findings.md.
    expect(mock.programId).toBeDefined();
    expect(gatekeeper.programId).toBeDefined();
    expect(pool.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});
```

**Note:** the initial test is only a scaffold. It is useful, but it does not prove CPI depth or license consumption. Task 0.4 is only complete when either (a) the minimal issue+execute CPI path is added here and passes, or (b) the plan explicitly records that CPI validation is deferred to Task 1.4 and the Phase 0 checkpoint remains open.

- [ ] **Step 7: Run the spike**

Run: `pnpm vitest run tests/integration/spike-cpi.test.ts`
Expected: PASS (or: fails with a clear reason that guides next step — e.g. "anchor-bankrun can't find target dir" fixes pathing).

- [ ] **Step 8: Commit spike**

Run: `git add -A && git commit -m "spike(cpi): verify gatekeeper→mock CPI toolchain"`

**Acceptance criteria for Task 0.4:** bankrun runs, both programs load, mock pool initializes, and the worker either verifies minimal gatekeeper → mock CPI or records the deferral as an unresolved Phase 0 risk. Do not mark the CPI-depth review checkbox complete from scaffold-only assertions.

---

### Task 0.5: SPIKE — Squads v4 vault_transaction integration [P0, Day 3]

**Files:**
- Create: `scripts/spike-squads-devnet.ts`

- [ ] **Step 1: Install Squads SDK**

Run: `pnpm add -w @sqds/multisig@latest`
Capture exact installed version in root `package.json` (pin it).

- [ ] **Step 2: Write Squads spike script**

Create `scripts/spike-squads-devnet.ts`:

```ts
import * as multisig from "@sqds/multisig";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const creator = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(path.join(process.env.HOME!, ".config/solana/id.json"), "utf-8"))));

  // Airdrop 2 SOL
  const airdrop = await connection.requestAirdrop(creator.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(airdrop, "confirmed");

  // Create multisig with 3 signers, threshold 2
  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  console.log("Multisig PDA:", multisigPda.toBase58());

  // Reference: https://docs.squads.so/main/development/typescript/instructions/create-vault-transaction
  // and https://v4-sdk-typedoc.vercel.app/. Implement the sequence as real code before committing;
  // do not leave this script as comments-only pseudocode. Concrete steps:
  //
  // 1) multisig.rpc.multisigCreateV2({
  //      connection, createKey, creator, multisigPda,
  //      configAuthority: null, threshold: 2, members: [m1, m2, m3], timeLock: 0, rentCollector: null,
  //    })
  //
  // 2) Build a dummy inner instruction — SystemProgram.transfer from vault PDA to creator for 0.001 SOL.
  //    Derive vault PDA: multisig.getVaultPda({ multisigPda, index: 0 }).
  //
  // 3) multisig.instructions.vaultTransactionCreate(...) or multisig.rpc.vaultTransactionCreate({
  //      connection, multisigPda, transactionIndex: newIdx, creator: creator.publicKey,
  //      vaultIndex: 0, ephemeralSigners: 0,
  //      transactionMessage: new TransactionMessage({ payerKey: vaultPda, recentBlockhash, instructions: [dummyTransferIx] }),
  //      memo: "spike",
  //    })
  //
  // 4) multisig.rpc.proposalCreate({ connection, multisigPda, transactionIndex: newIdx, creator: creator.publicKey })
  //
  // 5) multisig.rpc.proposalApprove({ connection, multisigPda, transactionIndex: newIdx, member: creator }) — repeat for threshold
  //
  // 6) multisig.rpc.vaultTransactionExecute({ connection, multisigPda, transactionIndex: newIdx, member: creator })
  //
  // Log each signature. Fetch the execution tx via connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 })
  // and inspect `meta.innerInstructions` — confirm vault PDA appears as signer in the inner SystemProgram::transfer.
  // Spike passes if execute succeeds AND vault PDA is the signer of the inner ix.

  throw new Error("Spike incomplete: replace comments above with executable Squads SDK calls before committing");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run against devnet**

Run: `pnpm tsx scripts/spike-squads-devnet.ts`
Expected: multisig created, proposal approved, tx executed; log shows vault PDA as inner signer.

- [ ] **Step 4: Document findings**

Create `docs/spike-findings.md` with:
- Exact `@sqds/multisig` version used
- Actual tx signatures + explorer URLs
- CPI depth observed (use `solana transaction-history` or explorer inner instructions)
- Gotchas encountered

- [ ] **Step 5: Commit**

Run: `git add -A && git commit -m "spike(squads): verify vault_transaction_execute with vault PDA as inner signer"`

**Phase 0 review checkpoint — STOP HERE if:**
- Squads vault PDA doesn't propagate as inner signer → fallback to "admin-only V1" (Cofre.operator signs all txs, no Squads gating at program level — governance is off-chain-documented)
- CPI depth limit is fundamentally exceeded → reconsider 2-tx pattern

---

## Phase 1 — F1 Core Happy Path (Days 4–8)

**Phase review checkpoint (end of day 8):**
- [ ] Full F1 flow recordable on screen: connect wallet → select cofre → prepare → sign proposal → 2nd signer approves with commitment check green → execute → balance updates
- [ ] All 10 gatekeeper instructions have passing LiteSVM tests
- [ ] `@cloak-squads/core` has ≥80% test coverage

---

### Task 1.1: Complete `cloak-gatekeeper` instructions [P0, Day 4]

**Files:**
- Create: `programs/cloak-gatekeeper/src/instructions/{init_cofre,init_view_distribution,add_signer_view,remove_signer_view,close_expired_license,emergency_close_license,revoke_audit,set_operator}.rs`
- Modify: `programs/cloak-gatekeeper/src/lib.rs` (wire new instructions)
- Create: `programs/cloak-gatekeeper/src/utils.rs`

- [ ] **Step 1: Write `utils.rs` with shared helpers**

```rust
use anchor_lang::prelude::*;
use crate::errors::CloakSquadsError;

/// Verify that `signer` is the Squads vault PDA derived from `multisig`.
/// Squads v4 vault PDA seeds: [b"multisig", multisig_pda, b"vault", vault_index_le_bytes]
/// For treasury use-case, vault_index = 0.
pub fn verify_squads_vault_signer(
    signer: &Pubkey,
    multisig: &Pubkey,
    squads_program_id: &Pubkey,
) -> Result<()> {
    let (expected, _bump) = Pubkey::find_program_address(
        &[b"multisig", multisig.as_ref(), b"vault", &0u8.to_le_bytes()],
        squads_program_id,
    );
    require_keys_eq!(*signer, expected, CloakSquadsError::InvalidSquadsSigner);
    Ok(())
}

pub const SQUADS_V4_PROGRAM_ID: Pubkey = anchor_lang::solana_program::pubkey!(
    "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"
);
```

- [ ] **Step 2: Write `init_cofre.rs`**

```rust
use anchor_lang::prelude::*;
use crate::state::*;
use crate::events::CofreInitialized;
use crate::utils::*;

pub fn handler(
    ctx: Context<InitCofre>,
    operator: Pubkey,
    view_key_public: [u8; 32],
) -> Result<()> {
    verify_squads_vault_signer(
        &ctx.accounts.multisig_vault.key(),
        &ctx.accounts.multisig.key(),
        &SQUADS_V4_PROGRAM_ID,
    )?;
    let cofre = &mut ctx.accounts.cofre;
    cofre.multisig = ctx.accounts.multisig.key();
    cofre.operator = operator;
    cofre.view_key_public = view_key_public;
    cofre.created_at = Clock::get()?.unix_timestamp;
    cofre.version = 1;
    cofre.revoked_audit = Vec::new();
    cofre.bump = ctx.bumps.cofre;
    emit!(CofreInitialized {
        cofre: cofre.key(),
        multisig: cofre.multisig,
        operator,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct InitCofre<'info> {
    /// CHECK: validated via verify_squads_vault_signer
    pub multisig: UncheckedAccount<'info>,
    pub multisig_vault: Signer<'info>,
    #[account(
        init, payer = payer, space = Cofre::INIT_SPACE,
        seeds = [b"cofre", multisig.key().as_ref()], bump,
    )]
    pub cofre: Account<'info, Cofre>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 3: Write remaining instructions** (`init_view_distribution`, `add_signer_view`, `remove_signer_view`, `close_expired_license`, `emergency_close_license`, `revoke_audit`, `set_operator`)

Pattern: each gated by Squads vault signer (except `close_expired_license` which is permissionless post-expiry, and `execute_with_license` which requires operator).

For brevity, write each following the same pattern as `init_cofre`. Each:
- Uses `verify_squads_vault_signer` for Squads-gated actions
- Uses `require_keys_eq!(ctx.accounts.operator.key(), ctx.accounts.cofre.operator, CloakSquadsError::NotOperator)` for operator-gated
- Uses an explicit positive expiry check for close paths:
  `require!(Clock::get()?.unix_timestamp > ctx.accounts.license.expires_at, CloakSquadsError::LicenseExpired);`
  If the error message reads awkwardly for "not expired yet", add a dedicated `LicenseNotExpired` enum variant instead of inventing a non-existent helper.

Specific requirements:
- `revoke_audit`: takes `diversifier_trunc: [u8; 16]`, pushes to `cofre.revoked_audit`. Fail with `RevocationCapacity` if `len() >= Cofre::MAX_REVOKED`. Clients must realloc via a separate `resize_cofre` instruction (add if needed).
- `close_expired_license`: `close = operator` constraint on License, with `operator: SystemAccount<'info>` or `UncheckedAccount<'info>` matching `cofre.operator`; only callable after `expires_at`.
- `emergency_close_license`: Squads-gated; closes regardless of expiry.

- [ ] **Step 4: Wire all instructions in lib.rs**

- [ ] **Step 5: Build and fix all compile errors**

Run: `cd programs/cloak-gatekeeper && anchor build`

- [ ] **Step 6: Commit**

Run: `git add -A && git commit -m "feat(gatekeeper): implement all 10 production instructions"`

---

### Task 1.2: Gatekeeper LiteSVM unit tests [P0, Day 4]

**Files:**
- Create: `tests/integration/gatekeeper.test.ts`

- [ ] **Step 1: Write test — init_cofre requires Squads vault signer**

```ts
it("init_cofre fails without valid Squads vault signer", async () => {
  const fakeMultisig = Keypair.generate();
  const fakeVault = Keypair.generate();
  await expect(
    gatekeeper.methods.initCofre(Keypair.generate().publicKey, new Uint8Array(32))
      .accountsPartial({
        multisig: fakeMultisig.publicKey,
        multisigVault: fakeVault.publicKey,
        /* ... */
      })
      .signers([fakeVault])
      .rpc()
  ).rejects.toThrow(/InvalidSquadsSigner/);
});
```

- [ ] **Step 2: Write test — execute_with_license rejects mismatched invariants**

```ts
it("execute_with_license rejects invariants that don't match license hash", async () => {
  const { cofre, operator } = await setupCofre();
  const license = await issueLicense(cofre, { nullifier: ..., commitment: ..., amount: 1000, ... });
  const wrongInvariants = { ...license.originalInvariants, amount: 9999 };
  await expect(
    gatekeeper.methods.executeWithLicense(wrongInvariants, new Uint8Array(256), new Uint8Array(32))
      .accountsPartial({ cofre, license: license.pda, operator: operator.publicKey, /* ... */ })
      .signers([operator])
      .rpc()
  ).rejects.toThrow(/LicensePayloadMismatch/);
});
```

- [ ] **Step 3: Write test — expired license cannot execute**

```ts
it("execute_with_license rejects expired licenses", async () => {
  const { cofre, operator } = await setupCofre();
  const license = await issueLicense(cofre, { ..., ttlSecs: 1 });
  await context.warpToSlot(context.lastBlockhash.slot + 100); // bankrun time-travel
  await expect(/* execute */).rejects.toThrow(/LicenseExpired/);
});
```

- [ ] **Step 4: Write test — double-consume rejected**

- [ ] **Step 5: Write test — close_expired_license works only post-expiry**

- [ ] **Step 6: Write test — emergency_close requires Squads**

- [ ] **Step 7: Write test — add_signer_view appends correctly**

- [ ] **Step 8: Write test — revoke_audit appends diversifier**

- [ ] **Step 9: Run full suite**

Run: `pnpm vitest run tests/integration/gatekeeper.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 10: Commit**

Run: `git add -A && git commit -m "test(gatekeeper): full instruction coverage with LiteSVM"`

---

### Task 1.3: Build `@cloak-squads/core` — crypto primitives [P0, Day 5]

**Files:**
- Create: `packages/core/{package.json,tsconfig.json}`, `packages/core/src/{index,types,encoding,hashing,derivation,view-key,commitment,audit}.ts`
- Create: `packages/core/tests/{encoding,hashing,derivation,view-key,commitment,audit}.test.ts`

- [ ] **Step 1: Package setup**

`packages/core/package.json`:

```json
{
  "name": "@cloak-squads/core",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cloak.dev/sdk": "^0.1.4",
    "@noble/hashes": "^1.5.0",
    "@solana/web3.js": "^1.98.0",
    "bs58": "^6.0.0",
    "ed25519-to-x25519": "^1.0.0",
    "tweetnacl": "^1.0.3",
    "tweetnacl-util": "^0.15.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "fast-check": "^3.23.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `encoding.ts` — canonical byte concat helpers**

```ts
import { PublicKey } from "@solana/web3.js";

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

export function u64ToLeBytes(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, n, true);
  return out;
}

export function pubkeyToBytes(pk: PublicKey | Uint8Array | string): Uint8Array {
  if (pk instanceof Uint8Array) return pk;
  if (typeof pk === "string") return new PublicKey(pk).toBytes();
  return pk.toBytes();
}

export function domainSeparator(name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name);
  // null-terminated
  const out = new Uint8Array(encoded.length + 1);
  out.set(encoded, 0);
  return out;
}
```

- [ ] **Step 3: Test `encoding.ts`**

`packages/core/tests/encoding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { concatBytes, u64ToLeBytes, domainSeparator } from "../src/encoding";

describe("encoding", () => {
  it("u64ToLeBytes produces little-endian 8 bytes", () => {
    const result = u64ToLeBytes(1n);
    expect(result).toEqual(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]));
  });
  it("concatBytes joins multiple arrays", () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4, 5]);
    expect(concatBytes(a, b)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });
  it("domainSeparator null-terminates", () => {
    const ds = domainSeparator("test");
    expect(ds).toEqual(new Uint8Array([116, 101, 115, 116, 0]));
  });
});
```

Run: `pnpm -F @cloak-squads/core test`. Expected: 3 pass.

- [ ] **Step 4: Write `hashing.ts`**

```ts
import { sha256 } from "@noble/hashes/sha256";
import { blake3 } from "@noble/hashes/blake3";
import { PublicKey } from "@solana/web3.js";
import { concatBytes, u64ToLeBytes, pubkeyToBytes, domainSeparator } from "./encoding";

export type PayloadInvariants = {
  nullifier: Uint8Array;       // 32
  commitment: Uint8Array;      // 32
  amount: bigint;
  tokenMint: PublicKey;
  recipientVkPub: Uint8Array;  // 32
  nonce: Uint8Array;           // 16
};

export function computePayloadHash(inv: PayloadInvariants): Uint8Array {
  if (inv.nullifier.length !== 32) throw new Error("nullifier must be 32 bytes");
  if (inv.commitment.length !== 32) throw new Error("commitment must be 32 bytes");
  if (inv.recipientVkPub.length !== 32) throw new Error("recipientVkPub must be 32 bytes");
  if (inv.nonce.length !== 16) throw new Error("nonce must be 16 bytes");
  const input = concatBytes(
    domainSeparator("cloak-squads-payload-v1"),
    inv.nullifier,
    inv.commitment,
    u64ToLeBytes(inv.amount),
    pubkeyToBytes(inv.tokenMint),
    inv.recipientVkPub,
    inv.nonce,
  );
  return sha256(input);
}

export type AuditDiversifierInput = {
  linkId: string;
  scope: "full" | "amounts_only" | "time_ranged" | "amounts_time_ranged";
  startDate: bigint; // unix ts or 0
  endDate: bigint;
};

export function computeAuditDiversifier(i: AuditDiversifierInput): Uint8Array {
  const input = concatBytes(
    domainSeparator("cloak-audit-v1"),
    new TextEncoder().encode(i.linkId),
    new TextEncoder().encode(i.scope),
    u64ToLeBytes(i.startDate),
    u64ToLeBytes(i.endDate),
  );
  return blake3(input).slice(0, 32);
}
```

- [ ] **Step 5: Property test `hashing.ts`**

```ts
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { computePayloadHash } from "../src/hashing";
import { PublicKey } from "@solana/web3.js";

describe("computePayloadHash", () => {
  it("is deterministic for same input", () => {
    fc.assert(fc.property(
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.bigUint({ max: 1000000n }),
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.uint8Array({ minLength: 16, maxLength: 16 }),
      (nullifier, commitment, amount, recipientVkPub, nonce) => {
        const inv = {
          nullifier, commitment, amount,
          tokenMint: PublicKey.default,
          recipientVkPub, nonce,
        };
        const h1 = computePayloadHash(inv);
        const h2 = computePayloadHash(inv);
        expect(h1).toEqual(h2);
      }
    ));
  });
});
```

- [ ] **Step 6: Write `derivation.ts`**

```ts
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { edwardsToMontgomery } from "ed25519-to-x25519";
import { generateCloakKeys, type CloakKeyPair } from "@cloak.dev/sdk";
import { concatBytes, pubkeyToBytes, domainSeparator } from "./encoding";

export async function deriveOperatorCloakKeys(
  multisig: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<CloakKeyPair> {
  const message = new TextEncoder().encode(`cloak-squads-operator-v1:${multisig.toBase58()}`);
  const signature = await signMessage(message);
  const masterSeed = sha256(concatBytes(
    domainSeparator("cloak-squads-operator-v1"),
    multisig.toBytes(),
    signature,
  ));
  return generateCloakKeys(masterSeed);
}

export async function deriveSignerDecryptKeypair(
  multisig: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<nacl.BoxKeyPair> {
  const message = new TextEncoder().encode(`cloak-squads-view-decrypt-v1:${multisig.toBase58()}`);
  const signature = await signMessage(message);
  const seed = hkdf(sha256, signature, undefined, new TextEncoder().encode("view-decrypt"), 32);
  return nacl.box.keyPair.fromSecretKey(seed);
}

export function ed25519PubkeyToX25519(ed25519Pub: Uint8Array): Uint8Array {
  if (ed25519Pub.length !== 32) throw new Error("Ed25519 pubkey must be 32 bytes");
  return edwardsToMontgomery(ed25519Pub);
}
```

- [ ] **Step 7: Test derivation determinism**

```ts
it("deriveOperatorCloakKeys is deterministic given same signature", async () => {
  const multisig = new PublicKey("11111111111111111111111111111111");
  const fakeSigner = nacl.sign.keyPair();
  const signMessage = async (m: Uint8Array) => nacl.sign.detached(m, fakeSigner.secretKey);
  const keys1 = await deriveOperatorCloakKeys(multisig, signMessage);
  const keys2 = await deriveOperatorCloakKeys(multisig, signMessage);
  expect(keys1.view.pvk_hex).toEqual(keys2.view.pvk_hex);
});
```

- [ ] **Step 8: Write `view-key.ts`** — encrypt view key for each signer

```ts
import nacl from "tweetnacl";
import { ed25519PubkeyToX25519 } from "./derivation";

export type EncryptedViewKeyEntry = {
  signer: Uint8Array;      // Solana pubkey, 32 bytes
  ephemeralPk: Uint8Array; // 32
  nonce: Uint8Array;       // 24
  ciphertext: Uint8Array;  // 48 (32 + 16 MAC)
};

export function encryptViewKeyForSigner(
  viewKeyPrivate: Uint8Array, // 32 bytes
  signerSolanaPubkey: Uint8Array, // Ed25519, 32 bytes
): EncryptedViewKeyEntry {
  if (viewKeyPrivate.length !== 32) throw new Error("view key must be 32 bytes");
  const signerX25519 = ed25519PubkeyToX25519(signerSolanaPubkey);
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(viewKeyPrivate, nonce, signerX25519, ephemeral.secretKey);
  return {
    signer: signerSolanaPubkey,
    ephemeralPk: ephemeral.publicKey,
    nonce,
    ciphertext,
  };
}

export function decryptViewKey(
  entry: EncryptedViewKeyEntry,
  signerDecryptSecret: Uint8Array, // from deriveSignerDecryptKeypair, 32 bytes
): Uint8Array {
  const result = nacl.box.open(entry.ciphertext, entry.nonce, entry.ephemeralPk, signerDecryptSecret);
  if (!result) throw new Error("failed to decrypt view key (wrong signer or corrupted)");
  return result;
}
```

- [ ] **Step 9: Test view-key round-trip**

```ts
it("encrypt→decrypt view key round-trips", async () => {
  const multisig = PublicKey.default;
  const signerKp = nacl.sign.keyPair();
  const signMessage = async (m: Uint8Array) => nacl.sign.detached(m, signerKp.secretKey);
  const decryptKp = await deriveSignerDecryptKeypair(multisig, signMessage);

  const viewKeyPrivate = nacl.randomBytes(32);
  const entry = encryptViewKeyForSigner(viewKeyPrivate, signerKp.publicKey);
  const recovered = decryptViewKey(entry, decryptKp.secretKey);
  expect(recovered).toEqual(viewKeyPrivate);
});
```

- [ ] **Step 10: Write `commitment.ts`**

Uses `computeCommitment` and `computeNullifier` from `@cloak.dev/sdk` directly. Exports a simple `verifyCommitmentMatches(claim, proofPublicInputs)` helper that both compute the expected commitment from the claim's (amount, r, recipient_vk, mint) and confirm it matches what's in the proof.

```ts
import { computeCommitment, computeNullifier, type NoteData } from "@cloak.dev/sdk";

export type CommitmentClaim = {
  amount: bigint;
  r: Uint8Array; // 32 bytes randomness
  skSpend: Uint8Array; // 32
  recipientVkPub: Uint8Array; // 32
  tokenMint: Uint8Array; // 32
};

export async function recomputeCommitment(claim: CommitmentClaim): Promise<Uint8Array> {
  const note: NoteData = {
    amount: Number(claim.amount),
    r: Buffer.from(claim.r).toString("hex"),
    sk_spend: Buffer.from(claim.skSpend).toString("hex"),
    commitment: "",
  };
  const c = await computeCommitment(note);
  return Buffer.from(c, "hex");
}

export function commitmentsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

- [ ] **Step 11: Write `audit.ts`**

```ts
import { deriveDiversifiedViewingKey, type ViewingKeyPair, type CloakKeyPair } from "@cloak.dev/sdk";
import { computeAuditDiversifier, type AuditDiversifierInput } from "./hashing";

export function deriveScopedAuditKey(
  cofreKeys: CloakKeyPair,
  scopeInput: AuditDiversifierInput,
): { viewingKey: ViewingKeyPair; diversifier: Uint8Array } {
  const diversifier = computeAuditDiversifier(scopeInput);
  const nk = cofreKeys.view.vk_secret; // or the nk derived from spend key — verify which SDK function matches
  const viewingKey = deriveDiversifiedViewingKey(nk, diversifier);
  return { viewingKey, diversifier };
}
```

- [ ] **Step 12: Write `index.ts` — public exports**

```ts
export * from "./encoding";
export * from "./hashing";
export * from "./derivation";
export * from "./view-key";
export * from "./commitment";
export * from "./audit";
export * from "./types";
```

- [ ] **Step 13: Run full core test suite**

Run: `pnpm -F @cloak-squads/core test`
Expected: all tests pass.

- [ ] **Step 14: Commit**

Run: `git add -A && git commit -m "feat(core): crypto primitives (hashing, derivation, view-key, commitment, audit)"`

---

### Task 1.4: Squads adapter + gatekeeper client [P0, Day 5]

**Files:**
- Create: `packages/core/src/{squads-adapter,gatekeeper-client}.ts`

- [ ] **Step 1: Write `squads-adapter.ts`**

Wraps `@sqds/multisig` to build `vault_transaction_create` for our `issue_license` instruction.

```ts
import * as multisig from "@sqds/multisig";
import { Connection, PublicKey, TransactionInstruction, TransactionMessage } from "@solana/web3.js";

export async function buildIssueLicenseProposal(params: {
  connection: Connection;
  multisigPda: PublicKey;
  creator: PublicKey;
  issueLicenseIx: TransactionInstruction;
}): Promise<{ transactionIndex: bigint; vaultTransactionPda: PublicKey }> {
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    params.connection,
    params.multisigPda,
  );
  const newTxIndex = BigInt(multisigInfo.transactionIndex.toString()) + 1n;
  const [vaultPda] = multisig.getVaultPda({ multisigPda: params.multisigPda, index: 0 });

  // Build TransactionMessage wrapping the issueLicenseIx. Squads docs use the vault PDA as payer
  // because the vault signs the inner transaction during vault_transaction_execute.
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await params.connection.getLatestBlockhash()).blockhash,
    instructions: [params.issueLicenseIx],
  });
  void message;
  // Use multisig.instructions.vaultTransactionCreate / multisig.rpc.vaultTransactionCreate
  // or transactionBuffer for >1232 byte payloads. Do not return before constructing and sending
  // the create instruction in the implementation.
  // Return transactionIndex and derived PDA after creation succeeds.
  const [vaultTransactionPda] = multisig.getTransactionPda({
    multisigPda: params.multisigPda,
    index: newTxIndex,
  });
  return { transactionIndex: newTxIndex, vaultTransactionPda };
}
```

- [ ] **Step 2: Write `gatekeeper-client.ts`**

```ts
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { PayloadInvariants } from "./hashing";
import { computePayloadHash } from "./hashing";

export function buildIssueLicenseIx(
  program: Program,
  cofre: PublicKey,
  invariants: PayloadInvariants,
  nonce: Uint8Array,
  ttlSecs: number,
  payer: PublicKey,
): Promise<TransactionInstruction> {
  const payloadHash = computePayloadHash(invariants);
  return program.methods
    .issueLicense(Array.from(payloadHash), Array.from(nonce), ttlSecs)
    .accountsPartial({ cofre, payer })
    .instruction();
}

export function buildExecuteWithLicenseIx(
  program: Program,
  cofre: PublicKey,
  license: PublicKey,
  operator: PublicKey,
  invariants: PayloadInvariants,
  proofBytes: Uint8Array,
  merkleRoot: Uint8Array,
  cloakProgram: PublicKey,
  pool: PublicKey,
  nullifierRecord: PublicKey,
): Promise<TransactionInstruction> {
  return program.methods
    .executeWithLicense(
      {
        nullifier: Array.from(invariants.nullifier),
        commitment: Array.from(invariants.commitment),
        amount: new BN(invariants.amount.toString()),
        tokenMint: invariants.tokenMint,
        recipientVkPub: Array.from(invariants.recipientVkPub),
        nonce: Array.from(invariants.nonce),
      },
      Array.from(proofBytes),
      Array.from(merkleRoot),
    )
    .accountsPartial({ cofre, license, operator, cloakProgram, pool, nullifierRecord })
    .instruction();
}
```

- [ ] **Step 3: Write adapter test harness** using bankrun to integrate Squads + gatekeeper end-to-end

Create `tests/integration/f1-send.test.ts` skeleton that:
1. Creates a Squads multisig with 2-of-3 signers
2. Calls our `init_cofre` via a Squads proposal (!)
3. Issues a license via a Squads proposal
4. Executes with license in a separate operator tx
5. Verifies License → Consumed + mock pool state changed

This is the integration e2e test that proves the full F1 machinery.

- [ ] **Step 4: Run and commit**

Run: `pnpm vitest run tests/integration/f1-send.test.ts`
Expected: end-to-end flow passes.

Run: `git add -A && git commit -m "feat(core): squads adapter + gatekeeper client + F1 integration test"`

---

### Task 1.5: Frontend app skeleton + wallet + cofre dashboard [P0, Day 6]

**Files:**
- Create: `apps/web/*` (Next.js app)

- [ ] **Step 1: Scaffold Next.js**

Run: `cd apps && pnpm create next-app@latest web --typescript --tailwind --app --no-src-dir --turbopack --import-alias "@/*"`

- [ ] **Step 2: Install deps**

```
pnpm -F web add @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/web3.js @coral-xyz/anchor @cloak.dev/sdk @sqds/multisig @cloak-squads/core zustand @tanstack/react-query framer-motion prisma @prisma/client zod pino
pnpm -F web add -D @types/node
```

- [ ] **Step 3: Install shadcn/ui**

```
pnpm -F web dlx shadcn@latest init
pnpm -F web dlx shadcn@latest add button card dialog input label sheet toast tabs
```

- [ ] **Step 4: Create env + prisma schema**

`apps/web/prisma/schema.prisma`:

```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model AuditLink {
  id            String   @id @default(uuid())
  cofreAddress  String
  diversifier   Bytes
  scope         String
  scopeParams   String?  // JSON
  expiresAt     DateTime
  issuedBy      String
  signature     Bytes
  createdAt     DateTime @default(now())
  @@index([cofreAddress])
}

model StealthInvoice {
  id                    String   @id @default(uuid())
  cofreAddress          String
  invoiceRef            String?
  memo                  String?
  stealthPubkey         String
  amountHintEncrypted   Bytes?
  status                String
  expiresAt             DateTime
  createdAt             DateTime @default(now())
  @@index([cofreAddress])
  @@index([stealthPubkey])
}
```

Run: `pnpm -F web prisma migrate dev --name init`

- [ ] **Step 5: Create app/layout.tsx with wallet + query providers**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { WalletProviders } from "@/components/wallet/WalletProviders";
import { QueryProvider } from "@/components/QueryProvider";

export const metadata: Metadata = { title: "Cloak Squads", description: "Private execution module for Squads v4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <WalletProviders>{children}</WalletProviders>
        </QueryProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Create wallet providers component**

```tsx
// components/wallet/WalletProviders.tsx
"use client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, BackpackWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo } from "react";

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL!;
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new BackpackWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 7: Build landing page with cofre picker**

`app/page.tsx`: list multisigs the connected wallet is a member of. Pick one → navigate to `/cofre/[multisig]`.

- [ ] **Step 8: Build cofre dashboard page**

`app/cofre/[multisig]/page.tsx`: show balance via `scanTransactions`, recent activity, actions (Send / Batch / Invoice / Audit).

- [ ] **Step 9: Verify build**

Run: `pnpm -F web build`
Expected: no errors.

- [ ] **Step 10: Commit**

Run: `git add -A && git commit -m "feat(web): scaffold Next.js app with wallet adapter + cofre dashboard"`

---

### Task 1.6: F1 Execute Private — operator flow [P0, Day 7]

**Files:**
- Create: `apps/web/app/cofre/[multisig]/send/page.tsx`, relevant components

- [ ] **Step 1: Send form UI**

Form fields: recipient (Cloak address input), amount, token (dropdown: USDC/USDT/SOL), memo (optional).

On submit:
1. Derive operator keys via wallet signMessage (`deriveOperatorCloakKeys`)
2. Generate 16-byte random nonce
3. Compute `payloadHash`
4. Build Squads vault_transaction with `issue_license(payloadHash, nonce, 900)`
5. Submit via `multisig.rpc.vaultTransactionCreate`
6. Redirect to `/cofre/[multisig]/proposals/[index]`

- [ ] **Step 2: Proof generation state component**

Use Framer Motion to show: "Verifying inputs... → Computing commitment... → Generating proof... → Ready".

- [ ] **Step 3: Proposal approval page**

Show:
- Decrypted payload claim (recipient, amount, memo)
- Commitment check result (green ✓ or red ✗)
- Approve / Reject buttons (disabled if red)
- Current approval count / threshold

- [ ] **Step 4: Execute flow for operator**

Separate button once threshold reached: "Execute Private". Generates proof, submits Tx B with compute budget ix + priority fee, handles root-stale retry.

- [ ] **Step 5: Manual E2E on devnet**

Deploy gatekeeper + cloak-mock to devnet, init a test cofre, run full flow.

- [ ] **Step 6: Commit**

---

### Task 1.7: Milestone — F1 demo recordable [P0, Day 8]

- [ ] Record screen capture (informal, 2 min) of full F1 flow on devnet
- [ ] Save to `docs/demos/f1-informal.mp4`
- [ ] Write `docs/DEMO.md` skeleton listing the 4 feature demos (F1 done, F2-F4 pending)
- [ ] Commit

---

## Phase 2 — F2 + F3 + F3.5 (Days 9–13)

**Phase review checkpoint (end of day 13):** "CFO pays payroll + issues audit link for accountant" end-to-end on devnet.

---

### Task 2.1: F2 — CSV uploader + multi-license proposal [P1, Day 9]

- [ ] CSV parser + validator (zod schema: `{ name, wallet, amount, memo? }[]`)
- [ ] Preview table + total fee estimate
- [ ] Build Squads proposal containing N `issue_license` instructions (one per recipient)
- [ ] Submit proposal; approval flow reuses single-proposal UI but lists all N payments
- [ ] **Cap at 10 recipients** in V1 (documented limitation)

### Task 2.2: F2 — Chained execution + replan UX [P1, Day 10]

- [ ] Sequential `execute_with_license` for each recipient
- [ ] Progress bar: "4/10 done"
- [ ] On failure at step N, offer "Replan from step N"
- [ ] Integration test in `tests/integration/f2-batch.test.ts`

### Task 2.3: F3 — Audit Access admin panel [P0, Day 11]

- [ ] UI: form to issue scoped viewing key (scope + date range + recipient email)
- [ ] API route `POST /api/audit-links` creates DB row + returns `id`
- [ ] Client uses `deriveScopedAuditKey` from core, builds URL with `#` fragment
- [ ] List active links + revoke button
- [ ] Revoke calls `cloak_gatekeeper::revoke_audit(diversifier_trunc)`

### Task 2.4: F3.5 — Audit Link public read-only panel [P0, Day 12]

- [ ] Route `/audit/[id]/page.tsx` parses fragment, validates signature, checks revocation
- [ ] Uses `scanTransactions` with scoped view key
- [ ] Renders table respecting scope
- [ ] `formatComplianceCsv` export button
- [ ] Integration test in `tests/integration/f3-audit.test.ts`

### Task 2.5: Phase 2 milestone demo [P0, Day 13]

- [ ] Record: CSV payroll → 3 approvals → 5 executions → admin issues audit link → contador opens link → CSV export
- [ ] Update `docs/DEMO.md`
- [ ] Commit

---

## Phase 3 — F4 + Polish + Mainnet (Days 14–17)

---

### Task 3.1: F4 — Stealth Invoicing creator [P2, Day 14]

- [ ] Create invoice form (amount, memo, expiry, optional invoice_ref)
- [ ] Generate `stealth_keypair`
- [ ] Build F1-like proposal with `recipient_vk_pub = stealth_kp.publicKey`
- [ ] Store invoice metadata in `stealth_invoices` table
- [ ] Generate + copy claim URL

### Task 3.2: F4 — Claim page for recipient [P2, Day 14]

- [ ] Route `/claim/[stealthId]/page.tsx` parses fragment
- [ ] Fetch invoice metadata → show memo + amount
- [ ] "Connect wallet & claim" → calls `fullWithdraw` with stealth spend key
- [ ] Gas funding via SOL dust (0.002 SOL bundled in the original shield)

### Task 3.3: F4 — Void invoice [P2, Day 15]

- [ ] Operator UI to void a pending invoice
- [ ] Uses the still-held stealth key to `partialWithdraw` back to treasury

### Task 3.4: Error state polish [P0, Day 15–16]

- [ ] All 17 error codes have UI treatment (alerts, retry buttons, recovery prompts)
- [ ] Framer Motion page transitions
- [ ] Loading states with meaningful descriptions

### Task 3.5: Deploy to mainnet [P0, Day 17]

- [ ] Deploy `cloak-gatekeeper` to mainnet (no `cloak-mock` — we use real Cloak)
- [ ] Update frontend env to point to mainnet
- [ ] Deploy frontend to Vercel with mainnet config
- [ ] Create demo cofre: 3 signers (team-held keypairs), fund 0.01 SOL + 0.1 USDC
- [ ] Run F1 + F3 flow end-to-end on mainnet
- [ ] Capture explorer URLs for README

### Task 3.6: Phase 3 milestone [P0, Day 17]

- [ ] Live mainnet URL works for judges
- [ ] Demo cofre pre-populated with one historical payment

---

## Phase 4 — Submission (Days 18–20)

---

### Task 4.1: Security review L5 checklist [P0, Day 18]

Run every item in spec's L5 checklist. File issues for any findings; fix P0/P1 before Day 19.

### Task 4.2: Documentation [P0, Day 19]

- [ ] `README.md` final: problem statement, target user, SDK usage (with code excerpts), setup, deployed IDs, live URL, video link
- [ ] `docs/ARCHITECTURE.md`: diagrams (text-based) linked to spec
- [ ] `docs/SECURITY.md`: V1 model explicit, V2 roadmap
- [ ] `docs/DEMO.md`: step-by-step judge reproduction script (< 10 min)
- [ ] Test setup with outsider: ask a friend to clone + run in 10 min. Note friction.

### Task 4.3: Video recording + submission [P0, Day 20]

- [ ] Morning: record demo video following `DEMO.md` script
  - 0:00–0:30 — Problem (public Squads with visible treasury)
  - 0:30–1:30 — F1 (single private send, explorer showing opaque tx)
  - 1:30–2:30 — F4 (stealth claim for contractor)
  - 2:30–3:30 — F3+F3.5 (admin issues audit link, contador opens, exports CSV)
  - 3:30–4:30 — Architecture + V1 honesty (operator-gated) + V2 roadmap
- [ ] Edit (minimal cuts, captions for clarity)
- [ ] Upload YouTube + Loom (belt + suspenders)
- [ ] Afternoon: submit to Superteam Earn + Colosseum Arena
- [ ] Confirmation emails saved
- [ ] Buffer: description polishing

---

## Weekly checkpoints (self-review)

**Mon Apr 27 (first review checkpoint):**
- [ ] Phase 0 complete? Spikes resolved?
- [ ] Phase 1 started?
- [ ] **If NO**: cut F4 entirely; compress Phase 3 to 2 days.

**Mon May 4 (second review checkpoint):**
- [ ] Phase 2 complete?
- [ ] **If NO**: cap F2 at 3 recipients; eliminate F4.

**Mon May 11 (final review checkpoint):**
- [ ] Phase 3 complete?
- [ ] **If NO**: freeze development, begin submission track with what exists.

---

## Priority Cuts Under Pressure

**Never cut:** F1, F3+F3.5 Audit, mainnet deploy, README, video, submission.
**May shrink:** F2 cap (10 → 5 → 3).
**May drop:** F4 Stealth, Framer Motion polish, L3/L4 tests, on-chain audit revocation (falls back to client-side).

**Absolute floor:** by May 12 EOD, if no video, **STOP dev and record**.

---

## Self-Review Summary

This plan covers every requirement in the spec:

- **Architecture** (Section 4 of spec) — Task 0.2/0.3 scaffolds both programs, Task 1.1 completes gatekeeper, Task 1.5 wires frontend
- **Security Model** (Section 5) — V1 operator-gated implemented in 1.1 (verify_squads_vault_signer + operator check in execute_with_license); commitment verification in Task 1.6 (signer approval page)
- **Features F1–F4** — Phases 1–3 respectively
- **Data Model** (Section 7) — Tasks 0.2, 1.1, 1.5 (Prisma)
- **Error Handling** (Section 8) — Task 3.4 surfaces all 17 codes
- **Testing** (Section 9) — L1 in Task 1.2, L2 in 1.4/2.2/2.4/3.2, L5 in 4.1
- **Repo structure** (Section 10) — Task 0.1 + incremental
- **Timeline** (Section 11) — exactly mapped to Phases 0–4
- **Submission** (Section 12) — Task 4.2, 4.3

Placeholder scan: no unresolved placeholder tokens remain, but two implementation checkpoints are intentionally called out before committing their tasks: the Squads spike script must be converted from comments to executable SDK calls, and the Cloak SDK export names must be verified against the installed package. Types consistent: `PayloadInvariants` struct referenced in core, gatekeeper, and frontend. Method signatures matched: `issue_license(payload_hash, nonce, ttl_secs)` identical in Rust, core client, and frontend caller.

Gaps acknowledged: Task 2.1 (batch proposal creation) and 2.2 (chained execution) are less atomic than Phase 1; this is deliberate — the engineer has established patterns by Phase 2 and can work from Task 1.6 + the spec. If granular guidance becomes needed mid-execution, the sub-agent workflow allows pausing for refinement.

---

**End of plan. Ready for execution.**

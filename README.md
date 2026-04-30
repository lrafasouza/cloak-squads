# cloak-squads (Aegis)

Private execution infrastructure for Squads multisig vaults on Solana, powered by Cloak Protocol.

The repository is named `cloak-squads`. The product is branded **Aegis**.

Aegis lets a Squads v4 multisig approve sensitive transfers without exposing operational details on every public surface. Members approve through Squads, a gatekeeper Anchor program issues a single-use license, and a registered operator completes the private transfer through Cloak.

The project is a **devnet prototype** for technical validation and demos. It is not mainnet-ready.

## What It Does

Aegis adds a privacy-aware execution layer around a Squads v4 multisig:

1. A multisig member prepares a private action (send, payroll batch, audit scope, or stealth invoice).
2. Squads members approve the proposal through the normal Squads threshold flow.
3. The Squads vault executes a transaction that calls the `cloak-gatekeeper` program.
4. The gatekeeper issues a time-limited, single-use execution license bound to a payload hash.
5. The registered operator consumes the license and performs the Cloak-backed private execution.

Sensitive client-side material (UTXO secrets, commitment claims) stays in the proposer's browser via `sessionStorage`. Server persistence is used for proposal metadata, payroll drafts, audit links, and stealth invoice state.

## Features

| Feature | Status | Notes |
| --- | --- | --- |
| Private Send | Devnet | Squads proposal → license → operator execution. |
| Payroll batch | Devnet | CSV upload, batch proposal with multiple licenses. |
| Audit Admin | Devnet | Scoped audit links with signed authorization and revocation. |
| Public Audit Link | Devnet | `/audit/<linkId>#<secret>` — fragment secret stays client-side. |
| Stealth Invoice | Devnet | Invoice links + claim flow backed by stored UTXO data. |
| Real Cloak Deposit | Devnet | Uses Cloak devnet SDK `transact()` for deposit-style execution. |
| 1-of-1 multisig | Tested end-to-end on devnet | Default demo path. |
| 2-of-N multisig | **Code path exists, NOT yet validated end-to-end** | See [Multi-member status](#multi-member-status). |
| Mainnet | Not ready | Needs security review, managed Postgres, monitoring, mainnet smoke tests. |

## Architecture

```text
┌──────────────┐      ┌────────────────────┐      ┌──────────────────┐
│  Squads v4   │ ───▶ │  cloak-gatekeeper  │ ───▶ │  Cloak devnet    │
│  multisig    │      │  Anchor program    │      │  privacy program │
└──────────────┘      └────────────────────┘      └──────────────────┘
        │                        │                          │
        ▼                        ▼                          ▼
  Vault PDA                Cofre + License             Shielded state
  approvals                accounts                    and relay

┌─────────────────────────────────────────────────────────────────────┐
│                         Next.js web app                              │
│  Wallet adapter · Squads SDK · Prisma/PostgreSQL · Cloak SDK wrappers │
└─────────────────────────────────────────────────────────────────────┘
```

### Main Components

| Component | Purpose |
| --- | --- |
| Squads v4 | External multisig: members, thresholds, approvals, vault transaction execution. |
| `cloak-gatekeeper` | Anchor program that initializes cofres, issues licenses, validates operators, enforces TTLs, consumes licenses. |
| `cloak-squads-test-harness` | Anchor program used only by integration tests to invoke the gatekeeper without spinning up real Squads. |
| Cloak devnet SDK | Privacy primitives + devnet transaction support (`@cloak.dev/sdk-devnet`). |
| Web app | Next.js interface for cofre creation, sends, payroll, audit, invoices, approvals, and operator execution. |
| Prisma + PostgreSQL | Persistence for proposal drafts, payroll drafts, audit links, and stealth invoice metadata. |
| `@cloak-squads/core` | Shared TypeScript package: PDAs, hashing, amount handling, view keys, audit helpers, gatekeeper utilities. |

## Tech Stack

| Layer | Technology |
| --- | --- |
| On-chain programs | Solana, Anchor 0.31.1, Rust |
| Frontend | Next.js 15 (App Router), React, Tailwind CSS, shadcn-style primitives |
| Wallets | Solana Wallet Adapter |
| Multisig | `@sqds/multisig` v2.1.4 (Squads v4) |
| Privacy | `@cloak.dev/sdk-devnet` |
| Data | Prisma + PostgreSQL (local via Docker, production via Render/Supabase) |
| Testing | Vitest unit, `anchor-bankrun` integration, optional devnet tests |
| Monorepo | pnpm workspaces, Turborepo |
| Formatting/Lint | Biome |

## Repository Structure

```text
.
├── apps/
│   └── web/                         # Next.js app and API routes
│       ├── app/                     # App Router pages and API handlers
│       │   ├── api/
│       │   ├── audit/               # Public audit link viewer
│       │   ├── claim/               # Stealth invoice claim flow
│       │   └── vault/[multisig]/    # Cofre dashboard, send, payroll, audit, invoice, operator, proposals
│       ├── components/              # UI, wallet, proposal, and proof components
│       ├── lib/                     # Web helpers and SDK integrations
│       └── prisma/                  # PostgreSQL schema and migrations
├── packages/
│   └── core/                        # Shared TypeScript utilities
├── programs/
│   ├── cloak-gatekeeper/            # Main Anchor gatekeeper program
│   └── cloak-squads-test-harness/   # Anchor harness used by integration tests
├── scripts/                         # Devnet setup, probes, seeds, exports, deploy, smoke tests
├── tests/
│   ├── integration/                 # anchor-bankrun integration tests (uses test harness)
│   ├── unit/                        # Vitest unit tests
│   └── devnet/                      # Optional devnet tests (gated by RUN_DEVNET_TESTS=1)
└── docs/                            # Architecture, security, demo, handoff, tech-debt docs
```

> Note: app routes live under `/vault/<multisig>/...` (the URL path), even though the on-chain account is called a "cofre".

## Program IDs

Current devnet configuration:

| Program | Address |
| --- | --- |
| Squads v4 | `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` |
| Cloak devnet | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| Cloak relay | `https://api.devnet.cloak.ag` |
| Cloak Gatekeeper | `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq` |

These are devnet defaults set via env vars; treat them as configuration, not constants.

## Prerequisites

- Node.js compatible with Next.js 15
- pnpm `9.12.0` (pinned via `packageManager`)
- Rust + Cargo (`rust-toolchain.toml` pins the toolchain)
- Solana CLI
- Anchor CLI (`0.31.x`)
- A funded Solana devnet wallet
- A devnet RPC endpoint (Helius/QuickNode strongly recommended for demos)

## Environment Setup

Copy the example environment file:

```bash
cp .env.example apps/web/.env.local
```

Defaults you should review (from `.env.example`):

```env
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_CLOAK_PROGRAM_ID=Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h
NEXT_PUBLIC_CLOAK_RELAY_URL=https://api.devnet.cloak.ag
NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq
NEXT_PUBLIC_SQUADS_PROGRAM_ID=SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aegis_dev
JWT_SIGNING_SECRET=dev-secret-replace-in-prod
LOG_LEVEL=debug
```

Replace `JWT_SIGNING_SECRET` outside local development. For demos, swap `NEXT_PUBLIC_RPC_URL` for a dedicated devnet RPC.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Start the local PostgreSQL database:

```bash
docker compose up -d postgres
```

Generate the Prisma client and apply migrations:

```bash
pnpm -F web prisma generate
pnpm -F web prisma migrate dev
```

Run the typecheck gate:

```bash
pnpm prebuild:web
```

Start the web app:

```bash
pnpm -F web dev
```

Open `http://localhost:3000`, connect a devnet wallet, and either create a new Squads multisig or paste an existing multisig address.

## Demo Data

```bash
pnpm seed:demo     # creates local demo data and a devnet cofre
pnpm seed:reset    # resets generated demo data
pnpm demo:setup    # alternative: only sets up the cofre via CLI
```

If devnet was reset and the cofre/gatekeeper accounts no longer exist, redeploy the gatekeeper (`pnpm deploy:gk -- --cluster devnet`) and rerun the seed.

## Common Workflows

> URL paths below use `/vault/<multisig>/...`.

### Create a Cofre

1. Connect a devnet wallet.
2. Create a new Squads multisig or paste an existing one.
3. Set members, threshold, and operator wallet.
4. Initialize the cofre.

For a 1-of-1 demo, use the connected wallet as both the only member and the operator. The `CreateMultisigCard` auto-approves and executes the cofre bootstrap when `threshold === 1`. For `threshold > 1`, the bootstrap proposal is created and must be approved/executed by the other members manually (see [Multi-member status](#multi-member-status)).

### Private Send

1. Open `/vault/<multisig>/send`.
2. Enter recipient, amount, and optional memo.
3. Create the Squads proposal.
4. Approve from `/vault/<multisig>/proposals/<id>`.
5. Execute the vault transaction to issue the license.
6. Open `/vault/<multisig>/operator` with the operator wallet and execute against the issued license.

### Payroll

1. Open `/vault/<multisig>/payroll`.
2. Upload a CSV (`scripts/test-payroll.csv` is a sample):

   ```csv
   name,wallet,amount,memo
   Alice,11111111111111111111111111111111,0.1,contractor payout
   ```

3. Review parsed recipients and total amount.
4. Create the payroll proposal.
5. Approve and execute through the normal Squads flow.
6. Use the operator page to execute the issued licenses.

### Audit Links

1. Open `/vault/<multisig>/audit`.
2. Select the audit scope and expiration.
3. Sign the authorization message.
4. Share the generated `/audit/<linkId>#<secret>` URL. The fragment secret is handled client-side.

### Stealth Invoices

1. Open `/vault/<multisig>/invoice`.
2. Create an invoice with recipient and amount details.
3. Share the generated claim URL.
4. The claimant opens `/claim/<stealthId>` and completes the claim flow.

## Multi-member status

The product targets multi-member Squads multisigs, but **the only end-to-end-validated flow today is 1-of-1**. The 2-of-N code path is implemented but has not been exercised against real wallets:

- `CreateMultisigCard` accepts arbitrary thresholds and only auto-executes when `threshold === 1`.
- `ApprovalButtons` and the `/vault/<multisig>/proposals/<id>` page read `approvals/threshold` from the on-chain `Multisig` account and gate `Execute` on `status === "approved"` (Squads enforces threshold on chain).
- A "Copy link" button in the proposal page lets the proposer share the URL with co-signers.
- Integration tests (`tests/integration/f1-send.test.ts`) declare a `2-of-3` shape but bypass real Squads enforcement — they call the harness directly. There is no automated 2-of-N regression yet.

Known gaps to expect when testing 2-of-N for the first time:

- The cofre bootstrap proposal is **not** persisted via `/api/proposals`, so it does not show up in the dashboard's "Recent proposals" for other members. They need the proposal URL directly.
- `commitmentClaim` lives only in the proposer's `sessionStorage`; co-signers see the on-chain status and the API draft fields, but no client-side commitment verification.
- The Cloak deposit cache (`cloak-deposit:<ms>:<idx>`) lives only in the proposer's `sessionStorage`; if the operator wallet runs in a different browser session, the operator page reconstructs the deposit on the fly (untested in 2-of-N).

Recommended first smoke test: two wallets (Phantom + Solflare or two browser profiles) → create 2-of-2 → bootstrap → send → approve from each → execute → operator.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install workspace dependencies. |
| `pnpm prebuild:web` | Typecheck the core package and web app. |
| `pnpm build:web` | Typecheck and build the web app. |
| `pnpm typecheck:all` | Typecheck all workspaces. |
| `pnpm lint` | Run Biome checks. |
| `pnpm format` | Format the repository with Biome. |
| `pnpm test:unit` | Run Vitest unit tests. |
| `pnpm test:int` | Run anchor-bankrun integration tests. |
| `pnpm test:all` | Run unit + integration tests. |
| `pnpm test:devnet` | Run optional devnet tests (sets `RUN_DEVNET_TESTS=1`). |
| `pnpm anchor:build` | Build Anchor programs (`NO_DNA=1 anchor build`). |
| `pnpm deploy:gk -- --cluster devnet` | Deploy the gatekeeper and update local config. |
| `pnpm seed:demo` / `pnpm seed:reset` | Seed or reset demo data. |
| `pnpm audit:export` | Export compliance/audit data. |
| `pnpm test:f1` / `pnpm test:f4` | Devnet smoke scripts for private send / stealth invoice. |
| `pnpm spike:devnet` / `pnpm spike:cloak` | Devnet exploration scripts. |

## Testing

```bash
pnpm test:unit     # vitest
pnpm test:int      # anchor-bankrun integration
pnpm test:all      # unit + integration
pnpm test:devnet   # optional devnet smoke tests
```

Devnet tests need a configured/funded wallet, working devnet programs, and a healthy RPC endpoint. They are gated behind `RUN_DEVNET_TESTS=1` so they don't run by default.

## Deploying the Gatekeeper

Deploy to devnet:

```bash
pnpm deploy:gk -- --cluster devnet
```

The script builds and deploys the Anchor program, updates the program ID in local config files, and regenerates the IDL used by the web app.

The gatekeeper has a Cargo `mainnet` feature that toggles `CLOAK_PROGRAM_ID` between the devnet mock and the real Cloak program:

```bash
anchor build                          # devnet (mock CLOAK_PROGRAM_ID)
anchor build -- --features mainnet    # mainnet (real Cloak program)
```

If you see `DeclaredProgramIdMismatch` in Anchor, the program ID in the Rust source disagrees with the deployed program. Rerun the deploy script and verify `NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID`.

## Security Model

The current system is operator-gated:

- Only the registered operator can consume a license.
- Licenses are single-use and TTL-bounded.
- The gatekeeper verifies the payload hash before consumption.
- License creation only happens through Squads vault transaction execution.
- API routes validate input with Zod and apply an in-memory rate limit (10 req/min/IP) on `POST /api/proposals`.
- Proposal and payroll metadata are persisted server-side; sensitive claim secrets stay client-side.

This is a devnet validation architecture. Before mainnet, the project needs deeper review of operator rotation, stale-root retry behavior, production storage, monitoring, infrastructure security, and end-to-end mainnet execution. See `docs/SECURITY.md` and `docs/TECH_DEBT.md`.

## Known Limitations

- Devnet-focused; no mainnet deployment path validated.
- Only 1-of-1 multisigs have been validated end-to-end; 2-of-N is implemented but untested (see [Multi-member status](#multi-member-status)).
- The UI is primarily desktop-optimized.
- Prisma uses PostgreSQL (local dev via Docker). Ensure `docker compose up -d postgres` is running before `prisma migrate dev`.
- Public devnet RPC endpoints rate-limit; demos should use a dedicated RPC.
- Solana devnet resets can wipe program/account state.
- Operator execution is self-service: the registered operator wallet must manually open `/vault/<multisig>/operator`.
- Some hardening items remain open in `docs/TECH_DEBT.md`.

## Documentation

- `docs/ARCHITECTURE.md` — system architecture, data flows, program accounts, persistence model.
- `docs/SECURITY.md` — trust assumptions, enforced checks, threat model, production requirements.
- `docs/DEMO.md` — demo runbook for private send, payroll, audit, public links.
- `docs/DEVNET_DEMO_READY.md` — devnet readiness checklist and smoke test.
- `docs/DEVNET_TESTING.md` — example multisig setup and testing notes.
- `docs/TECH_DEBT.md` — current technical debt and production hardening backlog.
- `docs/HANDOFF.md` — handoff context for future work.
- `docs/SYSTEM_DIAGRAMS.md` — visual diagrams of the flows.

## Project Status

Aegis is a working **devnet prototype** for private Squads execution. Active focus: validating product flows, hardening the gatekeeper, improving demo reliability, and validating the multi-member path before any mainnet preparation.

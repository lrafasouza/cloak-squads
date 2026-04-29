# Cloak Squads

Private execution infrastructure for Squads multisig vaults on Solana, powered by Cloak Protocol.

Cloak Squads lets a Squads multisig approve sensitive transfers without exposing the operational details to every public surface. Members approve execution through Squads, a gatekeeper program issues a single-use license, and a registered operator completes the private transfer through Cloak.

The project is currently built for devnet demonstrations and technical validation. It is not mainnet-ready.

## What It Does

Cloak Squads adds a privacy-aware execution layer around a Squads v4 multisig:

1. A multisig member prepares a private action, such as a send, payroll batch, audit scope, or stealth invoice.
2. Squads members approve the proposal using the normal Squads threshold flow.
3. The Squads vault executes a transaction that calls the `cloak-gatekeeper` program.
4. The gatekeeper issues a time-limited, single-use execution license tied to a payload hash.
5. The registered operator consumes the license and performs the Cloak-backed private execution.

Sensitive client-side material, such as UTXO secrets and commitment claims, stays in the browser when possible. Server persistence is used for proposal metadata, payroll drafts, audit links, and stealth invoice state.

## Features

| Feature | Status | Description |
| --- | --- | --- |
| Private Send | Done | Create a Squads proposal for a private transfer, approve it, issue a license, and execute it through the operator flow. |
| Payroll | Done | Upload a CSV and create a batch proposal with multiple private payment licenses. |
| Audit Admin | Done | Generate scoped audit links for a cofre with signed authorization and revocation support. |
| Public Audit Link | Done | Share a URL that exposes scoped audit data without requiring wallet authentication. |
| Stealth Invoice | Done | Create invoice links and support a claim flow backed by stored UTXO data. |
| Real Cloak Deposit | Devnet | Uses Cloak devnet SDK `transact()` for deposit-style execution. |
| Mainnet | Not ready | Requires additional security review, production infra, and mainnet smoke testing. |

## Architecture

```text
┌──────────────┐      ┌────────────────────┐      ┌──────────────────┐
│  Squads v4   │ ───▶ │  cloak-gatekeeper  │ ───▶ │  Cloak devnet     │
│  multisig    │      │  Anchor program    │      │  privacy program  │
└──────────────┘      └────────────────────┘      └──────────────────┘
        │                        │                          │
        ▼                        ▼                          ▼
  Vault PDA                Cofre + License             Shielded state
  approvals                accounts                    and relay

┌─────────────────────────────────────────────────────────────────────┐
│                         Next.js web app                              │
│  Wallet adapter · Squads SDK · Prisma/SQLite · Cloak SDK wrappers    │
└─────────────────────────────────────────────────────────────────────┘
```

### Main Components

| Component | Purpose |
| --- | --- |
| Squads v4 | External multisig system for members, thresholds, approvals, and vault transaction execution. |
| `cloak-gatekeeper` | Anchor program that initializes cofres, issues licenses, validates operators, enforces TTLs, and consumes licenses. |
| Cloak devnet SDK | Provides privacy primitives and devnet transaction support. |
| Web app | Next.js interface for cofre creation, private sends, payroll, audit links, invoices, approvals, and operator execution. |
| Prisma + SQLite | Local persistence for proposal drafts, payroll drafts, audit links, and stealth invoice metadata. |
| `@cloak-squads/core` | Shared TypeScript package for PDAs, hashing, amount handling, view keys, audit helpers, and gatekeeper utilities. |

## Tech Stack

| Layer | Technology |
| --- | --- |
| On-chain programs | Solana, Anchor, Rust |
| Frontend | Next.js 15, React, Tailwind CSS, shadcn-style UI primitives |
| Wallets | Solana Wallet Adapter |
| Multisig | `@sqds/multisig` v4 |
| Privacy | `@cloak.dev/sdk-devnet` |
| Data | Prisma, SQLite |
| Testing | Vitest, anchor-bankrun, LiteSVM-style local tests |
| Monorepo | pnpm workspaces, Turborepo |
| Formatting | Biome |

## Repository Structure

```text
.
├── apps/
│   └── web/                         # Next.js app and API routes
│       ├── app/                     # App Router pages and API handlers
│       ├── components/              # UI, wallet, proposal, and proof components
│       ├── lib/                     # Web app helpers and SDK integrations
│       └── prisma/                  # SQLite schema and migrations
├── packages/
│   └── core/                        # Shared TypeScript utilities
├── programs/
│   ├── cloak-gatekeeper/            # Main Anchor gatekeeper program
│   └── cloak-squads-test-harness/   # Test harness program
├── scripts/                         # Devnet setup, probes, seeds, exports, and smoke tests
├── tests/
│   ├── integration/                 # Bankrun integration tests
│   ├── unit/                        # Vitest unit tests
│   └── devnet/                      # Optional devnet tests
└── docs/                            # Architecture, security, demo, and handoff docs
```

## Program IDs

Current devnet configuration:

| Program | Address |
| --- | --- |
| Squads v4 | `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` |
| Cloak devnet | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| Cloak relay | `https://api.devnet.cloak.ag` |
| Cloak Gatekeeper | `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq` |

These values are configured through environment variables and should be treated as devnet defaults, not production constants.

## Prerequisites

- Node.js compatible with the Next.js and TypeScript toolchain used by this repo
- pnpm `9.12.0`
- Rust and Cargo
- Solana CLI
- Anchor CLI
- A funded Solana devnet wallet
- A devnet RPC endpoint with reasonable rate limits

The public Solana devnet RPC can work for light testing, but a dedicated devnet RPC is recommended for demos.

## Environment Setup

Copy the example environment file:

```bash
cp .env.example apps/web/.env.local
```

Review the values in `apps/web/.env.local`:

```env
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_CLOAK_PROGRAM_ID=Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h
NEXT_PUBLIC_CLOAK_RELAY_URL=https://api.devnet.cloak.ag
NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq
NEXT_PUBLIC_SQUADS_PROGRAM_ID=SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf
DATABASE_URL=file:./dev.db
JWT_SIGNING_SECRET=replace-this-with-a-long-random-secret
LOG_LEVEL=debug
```

For demos, replace `NEXT_PUBLIC_RPC_URL` with a reliable devnet RPC provider. Do not use the example `JWT_SIGNING_SECRET` outside local development.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Generate the Prisma client and prepare the local SQLite database:

```bash
pnpm -F web prisma generate
pnpm -F web prisma migrate deploy
```

Run type checks required before using the web app:

```bash
pnpm prebuild:web
```

Start the web app:

```bash
pnpm -F web dev
```

Open:

```text
http://localhost:3000
```

Connect a devnet wallet, create or enter a Squads multisig address, and open the cofre dashboard.

## Demo Data

To create local demo data and a devnet cofre:

```bash
pnpm seed:demo
```

To reset generated demo data:

```bash
pnpm seed:reset
```

If devnet has reset or the cofre account no longer exists, rerun the seed flow. If the gatekeeper deployment was also wiped, deploy it again with the gatekeeper deploy script.

## Common Workflows

### Create a Cofre

From the landing page:

1. Connect a devnet wallet.
2. Create a new Squads multisig or enter an existing multisig address.
3. Set members, threshold, and the operator wallet.
4. Initialize the cofre.

For a 1-of-1 demo, use the connected wallet as both member and operator.

### Private Send

1. Open `/cofre/<multisig>/send`.
2. Enter recipient, amount, and optional memo.
3. Create the Squads proposal.
4. Approve the proposal from the proposal page.
5. Execute the vault transaction to issue the license.
6. Open `/cofre/<multisig>/operator` with the operator wallet.
7. Load the proposal and execute with the issued license.

### Payroll

1. Open `/cofre/<multisig>/payroll`.
2. Upload a CSV with:

```csv
name,wallet,amount,memo
Alice,11111111111111111111111111111111,0.1,contractor payout
```

3. Review the parsed recipients and total amount.
4. Create the payroll proposal.
5. Approve and execute it through the normal Squads flow.
6. Use the operator page to execute the issued licenses.

A sample CSV is available at `scripts/test-payroll.csv`.

### Audit Links

1. Open `/cofre/<multisig>/audit`.
2. Select the audit scope.
3. Set expiration.
4. Sign the authorization message.
5. Share the generated audit URL.

Public audit links use the `/audit/<linkId>#<secret>` format. The fragment secret is handled client-side.

### Stealth Invoices

1. Open `/cofre/<multisig>/invoice`.
2. Create an invoice with recipient and amount details.
3. Share the generated claim URL.
4. The claimant opens `/claim/<stealthId>` and completes the claim flow.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install workspace dependencies. |
| `pnpm prebuild:web` | Typecheck the core package and web app. |
| `pnpm build:web` | Typecheck and build the web app. |
| `pnpm typecheck:all` | Typecheck all workspaces. |
| `pnpm lint` | Run Biome checks. |
| `pnpm format` | Format the repository with Biome. |
| `pnpm test:unit` | Run unit tests. |
| `pnpm test:int` | Run local integration tests. |
| `pnpm test:all` | Run unit and integration tests. |
| `pnpm test:devnet` | Run optional devnet tests. |
| `pnpm anchor:build` | Build Anchor programs. |
| `pnpm deploy:gk -- --cluster devnet` | Deploy the gatekeeper and update local config. |
| `pnpm seed:demo` | Seed demo data. |
| `pnpm audit:export` | Export compliance/audit data. |

## Testing

Run unit tests:

```bash
pnpm test:unit
```

Run integration tests:

```bash
pnpm test:int
```

Run the full local test suite:

```bash
pnpm test:all
```

Run optional devnet tests:

```bash
pnpm test:devnet
```

Devnet tests require a configured and funded wallet, working devnet programs, and a healthy RPC endpoint.

## Deploying the Gatekeeper

Deploy to devnet:

```bash
pnpm deploy:gk -- --cluster devnet
```

The deploy script builds and deploys the Anchor program, updates the program ID in local config files, and regenerates the IDL used by the web app.

If you see an Anchor `DeclaredProgramIdMismatch` error, the program ID in the Rust source does not match the deployed program. Rerun the deploy script and verify `NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID`.

## Security Model

The current system is operator-gated:

- Only the registered operator can consume a license.
- Licenses are single-use.
- Licenses expire after a configured TTL.
- The gatekeeper verifies the payload hash before consumption.
- License creation is controlled by the Squads vault execution flow.
- API routes validate input and apply rate limiting.
- Proposal and payroll metadata are persisted server-side.
- Browser-only secrets are kept out of API payloads where possible.

This is a devnet validation architecture. Before mainnet, the project needs deeper review of operator rotation, stale root retry behavior, production storage, monitoring, infrastructure security, and end-to-end mainnet execution.

## Known Limitations

- The project is devnet-focused.
- The UI is primarily optimized for desktop.
- Multi-member Squads flows are supported conceptually, but the demo path is easiest with a 1-of-1 multisig.
- Public devnet RPC endpoints may rate limit or fail during demos.
- Solana devnet resets can wipe program and account state.
- Some production hardening items remain open in `docs/TECH_DEBT.md`.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture, data flows, program accounts, and persistence model.
- [`docs/SECURITY.md`](docs/SECURITY.md) — trust assumptions, enforced checks, threat model, and production requirements.
- [`docs/DEMO.md`](docs/DEMO.md) — demo runbook for private send, payroll, audit, and public links.
- [`docs/DEVNET_DEMO_READY.md`](docs/DEVNET_DEMO_READY.md) — devnet readiness checklist and smoke test.
- [`docs/DEVNET_TESTING.md`](docs/DEVNET_TESTING.md) — example multisig setup and testing notes.
- [`docs/TECH_DEBT.md`](docs/TECH_DEBT.md) — current technical debt and production hardening backlog.
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — handoff context for future work.

## Project Status

Cloak Squads is a working devnet prototype for private Squads execution. The current focus is validating the product flows, hardening the gatekeeper, improving demo reliability, and preparing the path toward production-grade privacy execution.

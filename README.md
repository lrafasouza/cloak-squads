# Aegis

Private execution infrastructure for Squads multisig vaults on Solana.

Aegis wraps your existing Squads v4 multisig with a privacy-aware execution layer. Members approve through Squads, a gatekeeper program issues single-use licenses, and a registered operator completes private transfers through the Cloak protocol.

**Devnet prototype** — not mainnet-ready. See [ROADMAP.md](./ROADMAP.md) for what's next.

## What It Does

1. A member proposes a private action (send, payroll batch, stealth invoice).
2. Squads members approve through the normal threshold flow.
3. The vault executes a transaction that calls the gatekeeper program.
4. The gatekeeper issues a time-limited, single-use license.
5. The operator consumes the license and performs the Cloak-backed private transfer.

## Features

| Feature | Status | Description |
| --- | --- | --- |
| Private Send | Devnet | Squads proposal → gatekeeper license → operator executes via Cloak |
| Public Send | Working | Standard Squads vault transfer |
| Payroll Batches | Devnet | CSV upload, batch proposal with multiple licenses |
| Stealth Invoices | Devnet | Invoice links + claim flow backed by stored UTXO data |
| Audit Links | Devnet | Scoped, revocable audit views for accountants/regulators |
| Operator Role | Working | Dedicated wallet executes payments after team approval |
| Vault Import | Partial | Discovers mainnet vaults via on-chain scan; requires mainnet cluster config to use |
| Cloak Privacy | Experimental | Operator funds the Cloak deposit from own wallet (see ROADMAP) |

## Architecture

```
┌──────────────┐      ┌────────────────────┐      ┌──────────────────┐
│  Squads v4   │ ───▶ │  cloak-gatekeeper  │ ───▶ │  Cloak Protocol  │
│  multisig    │      │  Anchor program    │      │  privacy layer   │
└──────────────┘      └────────────────────┘      └──────────────────┘
        │                        │                          │
        ▼                        ▼                          ▼
  Vault PDA                Cofre + License             Shielded state
  approvals                accounts                    and relay

┌─────────────────────────────────────────────────────────────────────┐
│                         Next.js web app                              │
│  Wallet adapter · Squads SDK · Prisma/PostgreSQL · Cloak SDK        │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| On-chain | Solana, Anchor 0.31.1, Rust |
| Frontend | Next.js 15 (App Router), React, Tailwind CSS |
| Wallets | Solana Wallet Adapter (Phantom, Solflare) |
| Multisig | `@sqds/multisig` v2.1.4 (Squads v4) |
| Privacy | `@cloak.dev/sdk-devnet` |
| Data | Prisma + PostgreSQL |
| Testing | Vitest (unit), anchor-bankrun (integration) |
| Monorepo | pnpm workspaces, Turborepo |
| Lint | Biome |

## Quick Start

```bash
cp .env.example apps/web/.env.local
pnpm install
docker compose up -d postgres
pnpm -F web prisma generate
pnpm -F web prisma migrate dev
pnpm prebuild:web
pnpm -F web dev
```

Open `http://localhost:3000`, connect a devnet wallet, and create or import a Squads multisig.

## Program IDs (Devnet)

| Program | Address |
| --- | --- |
| Squads v4 | `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` |
| Cloak devnet | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| Cloak relay | `https://api.devnet.cloak.ag` |
| Cloak Gatekeeper | `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq` |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm prebuild:web` | Typecheck core + web |
| `pnpm build:web` | Typecheck and build |
| `pnpm lint` | Biome checks |
| `pnpm test:unit` | Vitest unit tests |
| `pnpm test:int` | anchor-bankrun integration tests |
| `pnpm test:all` | Unit + integration |
| `pnpm seed:demo` | Create demo data + devnet cofre |
| `pnpm deploy:gk -- --cluster devnet` | Deploy gatekeeper program |

## Privacy: Known Limitation

The private send flow has an architectural constraint: **the Cloak deposit is funded by the operator wallet, not the Squads vault**. This happens because the Vault PDA is program-owned and cannot sign Cloak deposit transactions directly.

This means:
- **Public sends** use vault balance (correct)
- **Private sends** require the operator to have SOL in their own wallet to fund the Cloak deposit

This is a limitation of the current Cloak + Squads integration model. See [ROADMAP.md](./ROADMAP.md) for the path to fixing this.

## Documentation

- `docs/ARCHITECTURE.md` — system architecture, data flows, program accounts
- `docs/SECURITY.md` — trust assumptions, threat model
- `docs/DEMO.md` — demo runbook
- `docs/TECH_DEBT.md` — tech debt inventory
- `docs/DEVNET_TESTING.md` — testing guide
- `docs/MELHORIAS_DETALHADAS.v2.md` — improvement plan

## Project Status

Working devnet prototype. Active focus: vault import for mainnet vaults, operator funding model, and mainnet preparation. See [ROADMAP.md](./ROADMAP.md).

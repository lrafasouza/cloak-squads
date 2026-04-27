# Cloak Squads

Private execution layer for Squads multisig vaults, powered by Cloak Protocol.

## What It Does

Cloak Squads enables Squads multisig members to approve private transfers that execute through a gatekeeper smart contract. The flow is:

1. **Propose** — A member creates a private send proposal (amount, recipient, invariants)
2. **Approve** — Signers vote on-chain via Squads `proposalApprove`
3. **Execute** — Once threshold is met, `vaultTransactionExecute` issues a license through the gatekeeper
4. **Operator consumes** — The operator wallet calls `execute_with_license`, which CPIs into Cloak for the private transfer

All sensitive material (note secrets, viewing keys) stays in the browser — never sent to the server.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Squads v4   │────▶│  cloak-gatekeeper │────▶│  cloak-mock  │
│  multisig    │     │  (devnet)         │     │  (devnet)    │
└─────────────┘     └──────────────────┘     └─────────────┘
       │                     │
       ▼                     ▼
  Vault PDA              Cofre PDA
  (inner signer)         (operator, view key)
```

- **Squads v4** — Manages multisig proposals, approvals, and vault transaction execution
- **cloak-gatekeeper** — Validates operator identity, license status, and payload integrity before CPI
- **cloak-mock** — Stub for the real Cloak program; records nullifier + commitment without ZK proofs
- **Web app** — Next.js 15 frontend with wallet adapter, Prisma + SQLite persistence, and commitment verification

## Tech Stack

| Layer | Tech |
|-------|------|
| On-chain programs | Anchor (Rust), Solana BPF |
| Frontend | Next.js 15, React 19, Tailwind CSS, shadcn/ui |
| Wallet | `@solana/wallet-adapter`, `@sqds/multisig` v4 |
| Privacy | `@cloak.dev/sdk` (mocked on devnet) |
| Persistence | Prisma + SQLite (proposal drafts) |
| Testing | `anchor-bankrun`, LiteSVM |
| Monorepo | pnpm workspaces, Turborepo |

## Quick Start

```bash
# Install dependencies
pnpm install

# Build core package + typecheck
pnpm prebuild:web

# Run web app
pnpm -F web dev
```

Open `http://localhost:3000`, connect a devnet wallet, and enter a multisig address.

## Program IDs (Devnet)

| Program | Address |
|---------|---------|
| Squads v4 | `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` |
| Gatekeeper | `WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J` |
| Cloak Mock | `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe` |

## Project Structure

```
├── programs/                  # Anchor on-chain programs
│   ├── cloak-gatekeeper/      # License issuer + operator gate
│   └── cloak-mock/            # Stub for real Cloak program
├── apps/web/                  # Next.js frontend
│   ├── app/cofre/[multisig]/  # Cofre dashboard, send, proposals, operator
│   ├── app/api/proposals/     # REST API for proposal draft persistence
│   └── lib/                   # Shared utilities
├── packages/core/             # Shared crypto, PDAs, types
├── tests/integration/         # Bankrun integration tests
├── scripts/                   # Devnet deploy, E2E, setup scripts
└── docs/                      # Demo runbook, spike findings
```

## Testing

```bash
# Integration tests (bankrun — no devnet needed)
pnpm test:int

# E2E on devnet (requires funded keypair)
SOLANA_KEYPAIR=~/.config/solana/cloak-devnet.json npx tsx scripts/f1-e2e-devnet.ts

# Typecheck all packages
pnpm typecheck:all
```

## Feature Status

| Feature | Status |
|---------|--------|
| F1 — Private Send | **DONE** |
| F2 — Payroll (batch CSV) | **DONE** |
| F3 — Audit Admin | **DONE** |
| F3.5 — Public Audit Link | **DONE** |

## Documentation

- [`docs/DEMO.md`](docs/DEMO.md) — Step-by-step demo runbook
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System architecture and data flows
- [`docs/SECURITY.md`](docs/SECURITY.md) — Security model and threat surface
- [`docs/spike-findings.md`](docs/spike-findings.md) — Phase 0 technical spike results
- [`docs/devnet-blocker.md`](docs/devnet-blocker.md) — Cloak devnet SDK blocker diagnosis

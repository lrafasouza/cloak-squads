# Cloak Squads Demo Runbook

## F1 — Private Send (DONE)

End-to-end flow: Squads vault approves a private execution license, then the operator executes the Cloak transfer through the gatekeeper. All on devnet with threshold 1.

### Prerequisites

- Devnet wallet funded with SOL.
- Squads v4 multisig on devnet (threshold 1, member = your wallet).
- `cloak-gatekeeper` deployed at `WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J`.
- `cloak-mock` deployed at `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe`.
- Program IDs configured in `apps/web/.env.local`.

### Setup

```bash
# From project root
pnpm install
pnpm prebuild:web
pnpm -F web dev
```

Optionally run the E2E script to verify the full on-chain flow:

```bash
npx tsx scripts/f1-e2e-devnet.ts
```

### Demo Flow

1. **Create proposal** — Open `http://localhost:3000`, connect your Squads member wallet, enter the multisig address, go to *Prepare send*, fill amount + recipient, click *Create proposal*.
2. **Approve** — On the proposal page, click *Approve*. The on-chain status should update to `approved`.
3. **Execute vault transaction** — Click *Execute vault transaction*. This issues the license on-chain.
4. **Operator consumes license** — Go to *Operator* from the cofre dashboard. Enter the proposal # and click *Load*. Connect the operator wallet (can be the same wallet for threshold 1). Click *Execute with license*. The license is consumed.

### Sandbox Multisig

`4UyJQecmT5irKwbgWyW3WeARsGfz8vii2cxsXBz5PMt5` — cofre initialized, threshold 1, member `2ScUUMp8xiuhPXhGWYZytuf5rsgZBQ1AuD3iF3qcMVxp`.

### Known Limitations (tech debt)

- **Threshold 1 only** — all flows are 1-of-1. Threshold ≥ 2 requires multi-member approval UI.
- **Mock proofs** — `execute_with_license` sends 256 zero bytes as proof and 32 zero bytes as merkle root.
- **Commitment check** — Cloak SDK is not wired in the browser build; the commitment card shows "unavailable".

### Key Signatures

| Step | Program | Event |
|------|---------|-------|
| Create proposal | Squads | `VaultTransactionCreate` + `ProposalCreate` |
| Approve | Squads | `ProposalApprove` |
| Execute vault tx | Squads → Gatekeeper | `issue_license` via CPI |
| Operator execute | Gatekeeper → Mock | `execute_with_license` |

---

## F2 — Payroll (PENDING)

Batch private sends via CSV upload. One Squads proposal contains N `issue_license` instructions. Page: `/cofre/[multisig]/payroll`.

## F3 — Audit Admin (PENDING)

Diversifier-based audit dashboard for cofre admins. Scope: full, amounts-only, time-ranged.

## F3.5 — Public Audit Link (PENDING)

Shareable link with view-only access to audit proofs for a specific diversifier.

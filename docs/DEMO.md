# Aegis Demo Runbook

## F1 — Private Send (DONE)

End-to-end flow: Squads vault approves a private execution license, then the operator executes the Cloak transfer through the gatekeeper. All on devnet with threshold 1.

### Prerequisites

- Devnet wallet funded with SOL.
- Squads v4 multisig on devnet (threshold 1, member = your wallet).
- `cloak-gatekeeper` deployed at `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq`.
- `cloak-mock` deployed at `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe`.
- Program IDs configured in `apps/web/.env.local`.

### Setup

```bash
pnpm install
pnpm prebuild:web
pnpm -F web dev
```

Optionally run the E2E script to verify the full on-chain flow:

```bash
SOLANA_KEYPAIR=~/.config/solana/cloak-devnet.json npx tsx scripts/f1-e2e-devnet.ts
```

### Demo Flow

1. **Create proposal** — Open `http://localhost:3000`, connect your Squads member wallet, enter the multisig address, go to *Prepare send*, fill amount + recipient, click *Create proposal*.
2. **Approve** — On the proposal page, click *Approve*. The on-chain status shows `X/Y approvals` and updates to `approved` once threshold is met.
3. **Execute vault transaction** — Click *Execute vault transaction*. This issues the license on-chain.
4. **Operator consumes license** — Go to *Operator* from the cofre dashboard. The registered operator is displayed and checked against the connected wallet. Enter the proposal # and click *Load*. Click *Execute with license*. The license is consumed.

### Data Persistence

Proposal drafts are persisted in SQLite via Prisma. Three API endpoints serve the UI:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/proposals` | POST | Create a new proposal draft |
| `/api/proposals/{multisig}` | GET | List drafts for a multisig (max 100) |
| `/api/proposals/{multisig}/{index}` | GET | Get a specific draft |

The dashboard lists recent drafts with links to the approval page.

**Note:** `commitmentClaim` (containing secrets `r`, `sk_spend`) is stored in `sessionStorage` only — never sent to the server. The commitment check reads it from the proposer's browser session.

### Commitment Check

The commitment verification card uses `computeCommitment` from `@cloak.dev/sdk-devnet`, injected via dependency registration at app init (`apps/web/lib/init-commitment.ts`). It recomputes the commitment locally and compares against the on-chain value. If the SDK fails to load (e.g., WASM not available), the card shows "unavailable" — voting is still allowed.

### Sandbox Multisig

`4UyJQecmT5irKwbgWyW3WeARsGfz8vii2cxsXBz5PMt5` — cofre initialized, threshold 1, member `2ScUUMp8xiuhPXhGWYZytuf5rsgZBQ1AuD3iF3qcMVxp`.

### Known Limitations

- **Threshold 1 only** — UI handles multi-member display (X/Y) but requires each member to open the proposal URL manually. No notification system.
- **Mock proofs** — `execute_with_license` sends 256 zero bytes as proof and 32 zero bytes as merkle root. Blocked by Cloak devnet SDK bug (see `docs/devnet-blocker.md`).
- **Shielded balance not displayed** — Dashboard shows `-- SOL`. Requires Cloak scan integration (`scanTransactions`).
- **No on-chain event indexing** — Activity feed on dashboard is placeholder.

### Key Signatures

| Step | Program | Event |
|------|---------|-------|
| Create proposal | Squads | `VaultTransactionCreate` + `ProposalCreate` |
| Approve | Squads | `ProposalApprove` |
| Execute vault tx | Squads → Gatekeeper | `issue_license` via CPI |
| Operator execute | Gatekeeper → Mock | `execute_with_license` |

---

## F2 — Payroll

Batch private sends via CSV upload. One Squads proposal contains N `issue_license` instructions. Page: `/cofre/[multisig]/payroll`.

1. Navigate to `/cofre/[multisig]/payroll`
2. Upload a CSV with columns: `name,wallet,amount,memo` (max 10 recipients in V1)
3. Review the preview table with total amount and fee estimate
4. Click "Create payroll proposal" — builds a Squads vault transaction with N `issue_license` instructions
5. Signers approve as usual on the proposal page (shows batch table with all recipients)
6. Once approved, execute the vault transaction — all licenses are issued in one go
7. Operator loads the proposal on `/cofre/[multisig]/operator` and executes chained `execute_with_license` for each recipient
8. Progress bar shows execution status; on failure, "Retry" button resumes from failed step

## F3 — Audit Admin

1. Navigate to `/cofre/[multisig]/audit`
2. Connect wallet (must be a cofre member)
3. Select scope:
   - **Full**: all transaction details including amounts and addresses
   - **Amounts Only**: transaction amounts only (addresses redacted)
   - **Time Ranged**: filter by date range
4. Set expiration (1-365 days)
5. Sign message to authorize
6. Link is generated and displayed

## F3.5 — Public Audit Link

Shareable URL format: `/audit/{linkId}#{secret}`

- Anyone with the link can view scoped audit data
- No wallet or authentication required
- Secret in URL fragment decrypts the diversifier client-side
- Link expires automatically after the set duration
- Admins can revoke links from the Audit Admin dashboard

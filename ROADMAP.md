# Aegis Roadmap

## P0 — Fix What We Sell

### Mainnet Vault Import

**Problem:** Vault discovery (`/api/vaults/mine`) correctly scans on-chain for multisigs where the connected wallet is a member and surfaces them. But when the user clicks one, `useVaultData()` reads the multisig account from the app's configured RPC — which points to **devnet**. Mainnet vaults don't exist on devnet, so the user sees "Unable to verify access."

**Why it matters:** Every real Squads team has vaults on mainnet. Without this, Aegis can't be used with any production multisig. This is the single most important adoption blocker.

**Options:**

- **Option A — Per-cluster config:** Make the app configurable. Vault dashboard reads from the cluster where the multisig lives. Privacy features remain devnet-only until the Cloak mainnet program is validated.
- **Option B — Dual-connection architecture:** `mainnetConnection` for reading vault/proposal data, `devnetConnection` for Cloak operations. Transparent to the user; routing happens in the SDK layer.

Both options require a dedicated mainnet RPC (Helius or QuickNode) — the public endpoint is too rate-limited for `getProgramAccounts` scans.

**Status:** Architecture decided (Option B), implementation in progress.

---

### Privacy: Operator Funding Model

**Problem:** `transact()` (the Cloak shield deposit) is signed and paid for by the **operator wallet**, not the Squads vault. The Vault PDA is program-owned by Squads and cannot sign Cloak deposit transactions.

This creates a confusing UX mismatch:
- Dashboard shows "Total Balance: 5 SOL" (vault balance)
- Public send draws from vault balance ✓
- Private send requires the operator to hold separate SOL ✗

**Why it matters:** Users expect private sends to behave like public ones from a funding perspective. The current model is confusing and breaks the mental model of "my vault's balance pays for this."

**Paths forward:**

1. **Transparent operator pre-fund (chosen short-term):** Add a "Fund Operator" proposal type that transfers SOL from vault to operator. Show clearly in the UI that this pre-fund step is required for privacy. Document that this is by design — the pre-fund is a separate, auditable event; the actual payment is private. This is the most honest approach without upstream protocol changes.
2. **Vault → Operator inline transfer:** Transfer SOL from vault to operator as the first step of private send execution. Creates one public record (vault→operator), then the Cloak deposit is the second step. Partially defeats privacy but removes the separate funding ceremony.
3. **Cloak CPI support (long-term):** Wait for/contribute to Cloak supporting program-signed deposits via CPI from Squads. This is the cleanest architectural solution but requires upstream protocol changes.

---

## P1 — Production Readiness

### Mainnet Deployment

- Switch `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`
- Validate the full private send flow against the mainnet Cloak program (`transact()` + `fullWithdraw()` API parity)
- Dedicated mainnet RPC (Helius or QuickNode)
- Managed PostgreSQL (Render or Supabase)
- Application monitoring and alerting
- Security audit of the gatekeeper program
- Mainnet smoke tests with real SOL before launch

### 2-of-N Hardening

- End-to-end tested on devnet with a 2-of-3 multisig
- Remaining gap: `commitmentClaim` is stored in the proposer's `sessionStorage` only — co-signers can't independently verify commitments before approving
- Fix: move commitmentClaim verification to the off-chain DB (encrypted, accessible to all members)
- Regression tests for multi-member flows (propose, approve, execute from different wallets)

### UI/UX Polish

- Mobile-responsive dashboard
- Better error states for RPC failures and Cloak relay timeouts
- Loading skeletons for all data-dependent views
- Consistent number formatting (SOL amounts, USD equivalents, lamport display)
- Operator funding model UX — clear "Fund Operator" flow with vault proposal

---

## P2 — New Features

### Aegis MCP (Model Context Protocol)

Build an MCP server that exposes Aegis vault operations to AI agents.

Capabilities:
- Check vault balance and member list
- Create and list payment proposals
- View pending operator queue
- Execute operator batch (with human-in-the-loop approval gate)

Use cases: AI treasury management, compliance reporting, automated payroll scheduling.

Implementation: Node.js MCP server wrapping the existing Squads SDK + gatekeeper client + Aegis API.

### Deeper Cloak Integration

The current integration covers the core deposit/withdraw cycle. Future depth:

- **SPL token privacy:** Extend `transact()` + `fullWithdraw()` beyond native SOL to support USDC and other SPL tokens (dependent on Cloak protocol support)
- **Time-locked private transfers:** Issue a license with a future TTL so the operator can only execute after a specific block height — useful for vesting schedules
- **Multi-hop privacy:** `vault → Cloak deposit → Cloak withdraw → new Cloak deposit → recipient` for higher anonymity sets on larger transfers
- **Privacy pools for recurring payroll:** Batch multiple payroll cycles through the same Cloak pool entry to blend the anonymity sets

### Team Management

- Member onboarding flows with invite links
- Role-based permissions: viewer, proposer, approver, operator
- Activity notifications (webhook + email) for proposals and executions
- Operator wallet rotation procedure with on-chain `set_operator` instruction

### Integrations

- Squads v5 compatibility when released
- Realms/DAO integration for governance-controlled vaults
- Cross-program invocation from other Solana programs via the gatekeeper

---

## Open Questions

- **Cloak mainnet API parity:** Does the mainnet Cloak program support the same `transact()` + `fullWithdraw()` API as devnet? Relay URL and program ID differ — need full validation before mainnet launch.
- **Operator economics:** Who funds the operator wallet? Should Aegis charge a small protocol fee to cover operator SOL costs? Or is the operator a designated team member who manages their own balance?
- **Compliance jurisdiction:** How do audit links interact with regulatory requirements in different jurisdictions? Scope controls (amounts_only, time_ranged) were designed with this in mind but need legal review.
- **Key recovery:** What happens if the operator wallet is lost between license issuance and execution? The license expires (15 min TTL) and the proposal must be re-executed, but this requires a new Squads vote. Emergency operator rotation needs a documented procedure.
- **Anonymity set size:** On devnet the Cloak pool has limited activity — anonymity sets are small. Mainnet pool depth needs evaluation before claiming production-grade privacy.

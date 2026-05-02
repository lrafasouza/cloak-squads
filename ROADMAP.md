# Aegis Roadmap

## P0 — Fix What We Sell

### Vault Import: Mainnet Compatibility

**Problem:** The vault discovery scan (`/api/vaults/mine`) correctly queries mainnet and finds vaults. But when the user clicks one, `useVaultData()` tries to read the multisig account using the app's configured RPC — which points to **devnet**. The account doesn't exist on devnet, so the user sees "Unable to verify access."

**Why it matters:** Most real Squads vaults are on mainnet. Users can't import and manage their existing vaults. This is the single most important feature for adoption.

**Fix:**
- Option A: Make the app configurable per-cluster. Vault dashboard reads from the cluster where the multisig actually lives. Privacy features only available on devnet.
- Option B: Dual-connection architecture. Main RPC = mainnet for reading vault data. Privacy operations route to devnet for Cloak.
- Requires a dedicated mainnet RPC (Helius/QuickNode) — public RPC is too rate-limited for `getProgramAccounts` scans.

### Privacy: Operator Funding Model

**Problem:** In the private send flow, the Cloak deposit is paid by the **operator wallet**, not the Squads vault. The Vault PDA is program-owned (Squads controls it) and cannot sign transactions for `cloakDeposit()`. So the operator needs their own SOL balance to fund every private transfer.

This creates a confusing UX:
- Dashboard shows "Total Balance: 5 SOL" (vault balance)
- Public send uses vault balance (correct)
- Private send requires the operator to have separate SOL (confusing)

**Why it matters:** We're selling privacy as a feature but the funding model doesn't match user expectations.

**Possible paths:**
1. **Vault → Operator pre-fund:** Transfer SOL from vault to operator first (creates a public on-chain record, partially defeats privacy purpose)
2. **Cloak CPI support:** Wait for/wrangle Cloak to support program-signed deposits via CPI from Squads. This is the cleanest solution but depends on upstream protocol changes.
3. **Transparent operator funding:** Make the operator funding step explicit in the UI. Show "Operator needs X SOL" prominently. Add a "Fund operator" vault proposal that transfers SOL from vault to operator. Document that this is how privacy works. This is the most honest short-term approach.

## P1 — Production Readiness

### Mainnet Deployment
- Switch `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`
- Cloak exists on mainnet — validate the full private flow against mainnet Cloak program
- Dedicated mainnet RPC
- Managed PostgreSQL (Render/Supabase)
- Monitoring and alerting
- Security audit of gatekeeper program
- Mainnet smoke tests with real SOL

### 2-of-N Hardening
- 2-of-N tested end-to-end on devnet
- Remaining: `commitmentClaim` in proposer's sessionStorage only, co-signers can't verify commitments
- Regression tests for multi-member flows

### UI/UX Polish
- Mobile-responsive dashboard
- Better error states for RPC failures
- Loading skeletons for all data-dependent views
- Number formatting (token amounts, USD values)

## P2 — New Features

### Aegis MCP (Model Context Protocol)
- Build an MCP server that exposes Aegis vault operations to AI agents
- Allows programmatic: check vault balance, create proposals, list pending transactions, execute operator queue
- Use case: AI agents managing treasury operations, compliance reporting, automated payroll
- Technical: Node.js MCP server wrapping the existing Squads SDK + gatekeeper client

### Advanced Privacy Features
- Time-locked transfers (execute after X blocks)
- Multi-hop privacy (vault → cloak → cloak → recipient)
- Privacy pools for SPL tokens (currently SOL only)

### Team Management
- Member onboarding flows
- Role-based permissions (viewer, proposer, approver, operator)
- Activity notifications

### Integrations
- Squads v5 compatibility when released
- Realms/DAO integration for governance-controlled vaults
- Cross-program invocation from other Solana programs

## Open Questions

- **Cloak mainnet readiness:** Does the mainnet Cloak program support the same `transact()` + `fullWithdraw()` API as devnet? Need to validate.
- **Operator economics:** Who funds the operator wallet? Should Aegis charge a fee to cover operator costs? Or is the operator a team member who volunteers?
- **Compliance:** How do audit links interact with regulatory requirements in different jurisdictions?
- **Key management:** What happens if the operator wallet is lost? Emergency rotation procedure?

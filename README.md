# Aegis

**Private execution infrastructure for Squads multisig vaults on Solana.**

Every Squads vault transfer is public by default — block explorers show the exact recipient, amount, and memo. For DAOs and teams managing payroll, vendor payments, or strategic investments, this is a real problem: counterparties can front-run trades, salary structures are exposed, and operational security is zero.

Aegis wraps your existing Squads v4 multisig with a privacy-aware execution layer. Members approve through the normal Squads flow. A custom on-chain gatekeeper program issues single-use, time-limited licenses. A registered operator uses those licenses to route payments through the **Cloak protocol** — a zero-knowledge shield pool that breaks the on-chain link between sender and recipient.

**Live demo:** [https://aegis-web-iiv0.onrender.com](https://aegis-web-iiv0.onrender.com) (devnet)

**Built for the [Cloak Track](https://superteam.fun/earn/listing/cloak-track).**

---

## Testing the Live Demo (for Judges)

The app runs on devnet. Here's the fastest path to see the full private payment flow:

**Prerequisites:**
1. Install [Phantom](https://phantom.app) or [Solflare](https://solflare.com)
2. Switch your wallet to **Devnet** (Settings → Developer Settings → Devnet)
3. Fund with devnet SOL: [faucet.solana.com](https://faucet.solana.com) (you need two wallets — one proposer, one operator)

**Fastest flow to test (2 wallets):**

```
Wallet A = multisig member / proposer
Wallet B = operator (executes private payments)
```

1. Open [https://aegis-web-iiv0.onrender.com](https://aegis-web-iiv0.onrender.com) with **Wallet A**
2. Click **Create Vault** → configure a 1-of-1 multisig with Wallet A as the only member and **Wallet B as operator**
3. Fund the vault with ~0.1 devnet SOL (the vault has a deposit address on the dashboard)
4. Click **Private Send** → enter Wallet B's address and 0.01 SOL
5. The app generates a UTXO commitment and creates a Squads proposal on-chain
6. Approve the proposal (1-of-1 threshold — instant)
7. Switch to **Wallet B** (the operator)
8. Open the same vault → click **Operator** tab
9. Click **Execute** on the pending payment
10. Watch the ZK proof generate in the browser (~30 seconds) and the Cloak shield transaction confirm
11. Wallet B receives SOL. The on-chain trace shows operator → Cloak pool. The vault is not visible.

**To test Stealth Invoices:**
1. From the vault, click **Invoice** → create a stealth invoice
2. Copy the secret claim link
3. Open the link in an incognito window with any devnet wallet
4. Claim the invoice — the UTXO is decrypted and withdrawn via Cloak to your wallet

**To test Payroll:**
1. Click **Payroll** → upload or manually enter 2–3 recipients
2. Submit creates a single Squads proposal with one license per recipient
3. Operator executes the batch from the Operator tab

---

## The Problem

| What you want to pay | What's on-chain without Aegis |
|---|---|
| Salary to a contractor | `Vault PDA → Alice.sol: 2.4 SOL` |
| Vendor invoice | `Vault PDA → VendorWallet: 8 SOL, memo: "Q2 services"` |
| Strategic acquisition | `Vault PDA → Target.sol: 500 SOL` |

Any wallet with a block explorer can watch your vault in real time. Aegis breaks that link.

---

## Who It's For

- **DAOs** that need payroll privacy (salary amounts, recipient wallets)
- **Investment DAOs** that don't want front-running on strategic moves
- **Teams with external operators** who need approval-gated private execution
- **Businesses** paying vendors where confidentiality is contractually required

## Real World Scenarios

**DAO Payroll:** A 12-person DAO pays contributors monthly. Without privacy, every contributor's wallet and salary is visible on-chain — anyone can correlate identities to compensation. With Aegis, the DAO votes on each payroll batch through Squads, but the actual payments route through Cloak. Observers see Cloak pool activity, not DAO → Alice: 4 SOL.

**Vendor Payment:** A protocol pays an auditing firm 50 SOL for a security review. The payment amount and the auditor's wallet are competitively sensitive. Aegis routes the payment through Cloak after multisig approval — the vendor receives SOL privately, with a stealth invoice as the delivery mechanism.

**Investment:** A treasury DAO wants to acquire a large token position OTC. Broadcasting the vault address as the buyer would move the market. The Cloak-routed payment keeps the buyer identity off the public trace until settlement.

---

## How It Works

```
1. A member proposes a private payment (send, payroll, or stealth invoice).
2. Squads members approve through the normal threshold flow.
3. On execution, the vault calls the gatekeeper program.
4. The gatekeeper issues a time-limited, hash-locked license.
5. The operator deposits funds into the Cloak shield pool (transact).
6. The operator consumes the license and routes the withdrawal to the recipient (fullWithdraw).
   The on-chain record shows: operator → Cloak pool. Nothing links vault to recipient.
```

---

## Cloak SDK Integration

Cloak is not a peripheral feature — it is the entire privacy mechanism. Without Cloak, Aegis is just a Squads wrapper. The Cloak SDK (`@cloak.dev/sdk-devnet`) is used at every step where privacy matters.

### What the SDK does for Aegis

**1. UTXO generation at proposal creation time**

When a member creates a private send, the app uses the Cloak SDK to generate a UTXO keypair and compute a commitment hash:

```typescript
import {
  generateUtxoKeypair,
  createUtxo,
  computeUtxoCommitment,
  NATIVE_SOL_MINT,
} from "@cloak.dev/sdk-devnet";

const keypair = await generateUtxoKeypair();
const utxo = await createUtxo(lamports, keypair, NATIVE_SOL_MINT);
const commitmentBigInt = await computeUtxoCommitment(utxo);
```

That commitment becomes the payload hash locked into the on-chain gatekeeper license. Nobody can execute without the matching UTXO data.

**2. Shielding funds with `transact()`**

The operator calls `transact()` to deposit funds into the Cloak zero-knowledge shield pool. This is the step that breaks the on-chain link:

```typescript
import { transact, createZeroUtxo } from "@cloak.dev/sdk-devnet";

const result = await transact(
  {
    inputUtxos: [await createZeroUtxo(mint), await createZeroUtxo(mint)],
    outputUtxos: [outputUtxo, await createZeroUtxo(mint)],
    externalAmount: lamports,
    depositor: operatorPublicKey,
  },
  {
    connection,
    programId: CLOAK_PROGRAM_ID,
    relayUrl: "/api/cloak-relay",   // same-origin proxy to avoid CORS
    signTransaction: wallet.signTransaction,
    signMessage: wallet.signMessage,
    depositorPublicKey: operatorPublicKey,
    onProgress: (msg) => setStatus(msg),
    onProofProgress: (pct) => setProofPct(pct),  // ZK proof %
  }
);
// result: { signature, commitmentIndices, outputUtxos, merkleTree }
```

The ZK proof generation runs entirely in the browser via WASM — no trusted third party sees the transaction data.

**3. Unshielding to recipient with `fullWithdraw()`**

After the license is consumed on-chain, the operator withdraws from the shield pool directly to the recipient:

```typescript
import { fullWithdraw } from "@cloak.dev/sdk-devnet";

await fullWithdraw([reconstructedUtxo], recipientPublicKey, {
  connection,
  programId: CLOAK_PROGRAM_ID,
  relayUrl: "/api/cloak-relay",
  signTransaction: wallet.signTransaction,
  signMessage: wallet.signMessage,
  depositorPublicKey: operatorPublicKey,
  onProgress: (msg) => setStatus(msg),
  onProofProgress: (pct) => setProofPct(pct),
});
```

The recipient receives SOL. On-chain, this looks like a Cloak pool withdrawal — the vault is nowhere in the trace.

**4. Stealth invoices via derive + claim**

For stealth invoices, the recipient gets a secret link containing a UTXO private key. They use the Cloak SDK to derive the matching public key and withdraw:

```typescript
import { derivePublicKey, fullWithdraw } from "@cloak.dev/sdk-devnet";

const publicKey = await derivePublicKey(privateKeyBigInt);
// Reconstruct UTXO, call fullWithdraw to claim
```

**5. ZK proof pre-warming**

The app pre-warms the Poseidon WASM on page load (payroll page) so proof generation doesn't cold-start:

```typescript
import { poseidon } from "@cloak.dev/sdk-devnet";
await poseidon.init(); // pre-warm on page load
```

### Why Cloak is central

Every private payment in Aegis passes through three Cloak SDK calls: `generateUtxoKeypair` + `computeUtxoCommitment` at proposal time, `transact()` at deposit time, and `fullWithdraw()` at delivery time. Remove Cloak and the privacy layer disappears entirely — what's left is a standard Squads transfer with a wrapper.

---

## Features

| Feature | Status | Description |
|---|---|---|
| Private Send | Devnet | Proposal → gatekeeper license → operator deposits to Cloak shield pool → `fullWithdraw` to recipient |
| Public Send | Working | Standard Squads vault transfer, no privacy layer |
| Payroll Batches | Devnet | CSV upload → batch license proposal → operator executes each row via Cloak |
| Stealth Invoices | Devnet | Secret claim links — recipient decrypts UTXO and withdraws via Cloak SDK |
| Audit Links | Devnet | Scoped, revocable read access for accountants and regulators (Ed25519-signed) |
| Vault Import | Devnet | Discovers your existing Squads multisigs; mainnet import in progress (see Roadmap) |
| Operator Dashboard | Working | Queue view, ZK proof progress, per-recipient execution, batch payroll processing |
| Member Management | Working | Add/remove members, change threshold — all via Squads config proposals |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  Member Browser                                                         │
│  Create proposal → generateUtxoKeypair() → computeUtxoCommitment()    │
│  Build issue_license ix → Squads proposal → PostgreSQL draft saved     │
└────────────────────┬───────────────────────────────────────────────────┘
                     │ Squads approval flow (N-of-M)
                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Squads v4 Multisig (on-chain)                                         │
│  vaultTransactionCreate → proposalApprove (N members) → execute        │
│  Vault PDA signs: calls gatekeeper.issue_license(payload_hash, ttl)    │
└────────────────────┬───────────────────────────────────────────────────┘
                     │ On-chain license issued (hash-locked, 15 min TTL)
                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Cloak Gatekeeper Program  (AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq) │
│  License PDA: payload_hash, nonce, ttl, consumed=false                 │
└────────────────────┬───────────────────────────────────────────────────┘
                     │ Operator reads draft + license
                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Operator Browser                                                       │
│  1. transact()  →  deposit to Cloak shield pool (ZK proof in browser)  │
│  2. execute_with_license  →  consume license, release vault funds      │
│  3. fullWithdraw()  →  unshield to recipient (ZK proof in browser)     │
└────────────────────┬───────────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Cloak Protocol  (Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h)        │
│  Shield pool · ZK relayer · UTXO merkle tree                           │
│  Relay: https://api.devnet.cloak.ag                                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/lrafasouza/aegis
cd cloak-squads
pnpm install

# 2. Configure environment
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local — the defaults work for devnet

# 3. Start database
docker compose up -d postgres

# 4. Run migrations and generate client
pnpm -F web prisma generate
pnpm -F web prisma migrate dev

# 5. Typecheck packages
pnpm prebuild:web

# 6. Start dev server
pnpm -F web dev
```

Open [http://localhost:3000](http://localhost:3000), connect a **devnet wallet** (Phantom or Solflare), and create or import a Squads multisig.

To test the full private send flow you need two devnet wallets: one as a multisig member/proposer and one as the registered operator. The operator wallet needs devnet SOL to fund the Cloak deposit.

---

## Program IDs

| Program | Network | Address |
|---|---|---|
| Squads v4 | Devnet + Mainnet | `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` |
| Cloak protocol | Devnet | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| Cloak relay | Devnet | `https://api.devnet.cloak.ag` |
| Cloak Gatekeeper | Devnet | `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| On-chain | Solana, Anchor 0.31.1, Rust |
| Frontend | Next.js 15 (App Router), React, Tailwind CSS |
| Wallets | Solana Wallet Adapter (Phantom, Solflare) |
| Multisig | `@sqds/multisig` v2.1.4 (Squads v4) |
| Privacy | `@cloak.dev/sdk-devnet` — `transact`, `fullWithdraw`, `generateUtxoKeypair`, `computeUtxoCommitment`, `derivePublicKey` |
| Data | Prisma + PostgreSQL |
| Monorepo | pnpm workspaces, Turborepo |
| Testing | Vitest (unit), anchor-bankrun (integration) |
| Lint | Biome |

---

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm prebuild:web` | Typecheck core + web |
| `pnpm build:web` | Full production build |
| `pnpm lint` | Biome lint checks |
| `pnpm test:unit` | Vitest unit tests |
| `pnpm test:int` | anchor-bankrun integration tests |
| `pnpm test:all` | Run all tests |
| `pnpm seed:demo` | Seed demo data and devnet cofre |
| `pnpm deploy:gk -- --cluster devnet` | Deploy gatekeeper program |

---

## Known Limitation: Operator Funding Model

The Cloak deposit (`transact()`) is funded by the **operator wallet**, not the Squads vault. This is an architectural constraint: the Vault PDA is program-owned by Squads and cannot sign Cloak deposit transactions directly.

This means:
- **Public sends** draw from vault balance (correct)
- **Private sends** require the operator to hold SOL to fund the Cloak deposit

The intended solution is making this operator pre-funding explicit in the UI — a vault proposal that transfers SOL from the vault to the operator, documented as the privacy funding step. See [ROADMAP.md](./ROADMAP.md) for the full options.

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture and data flows
- [`docs/SECURITY.md`](docs/SECURITY.md) — trust model and threat analysis
- [`docs/DEMO.md`](docs/DEMO.md) — demo runbook
- [`docs/TECH_DEBT.md`](docs/TECH_DEBT.md) — known debt and trade-offs
- [`docs/DEVNET_TESTING.md`](docs/DEVNET_TESTING.md) — testing guide
- [`ROADMAP.md`](./ROADMAP.md) — what's next

---

## Project Status

Working devnet prototype. The private send, payroll, stealth invoice, and audit link flows are all functional end-to-end on devnet. Active focus: mainnet vault import, operator funding UX, and production deployment. See [ROADMAP.md](./ROADMAP.md).

# Aegis

**Privacy infrastructure for every Solana treasury. Built on Squads, powered by Cloak.**

Every Squads vault transfer is public by default — block explorers show the exact recipient, amount, and memo. For DAOs and teams managing payroll, vendor payments, or strategic investments, this is a real problem: counterparties can front-run trades, salary structures are exposed, and operational security is zero.

Aegis is the privacy layer that any Solana multisig can integrate — extending Squads first, with CPI hooks for Realms and custom multisigs next. It turns approval-gated multisig payments into cryptographically unlinkable, auditable, compliance-ready transfers — without changing how teams already vote. A custom on-chain gatekeeper program issues single-use, time-limited licenses. A registered operator uses those licenses to route payments through the **Cloak protocol** — a zero-knowledge shield pool that breaks the on-chain link between sender and recipient.

On top of that core, Aegis ships **bearer invoices** (claim links with no recipient wallet committed at create time, so the buyer picks the destination at claim time), **recurring payments** (weekly to quarterly cadences, public or private per schedule), and **scoped audit links with Ed25519-signed exports + an access log** so accountants and regulators get verifiable evidence on demand.

**Live demo:** [https://aegisz.xyz](https://aegisz.xyz) (devnet)

**Built for the [Cloak Track](https://superteam.fun/earn/listing/cloak-track).**

---

## Testing the Live Demo (for Judges)

The app runs on devnet. Here's the fastest path to see the full private payment flow:

**Prerequisites:**
1. Install [Phantom](https://phantom.app) or [Solflare](https://solflare.com)
2. Switch your wallet to **Devnet** (Settings → Developer Settings → Devnet)
3. Fund both wallets with devnet SOL: [faucet.solana.com](https://faucet.solana.com). The vault wallet pays the actual transfer amount; the operator wallet only needs ~0.05 SOL for transaction fees (the vault auto-funds the payment value into the operator on proposal execution).

**Fastest flow to test (2 wallets):**

```
Wallet A = multisig member / proposer
Wallet B = operator (executes private payments)
```

1. Open [https://aegisz.xyz](https://aegisz.xyz) with **Wallet A**
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

**To test Stealth Invoices (bound):**
1. From the vault, click **Invoice** → leave mode on **Bound to wallet** → fill recipient + amount
2. Copy the secret claim link
3. Open the link in an incognito window connected with the recipient wallet
4. Claim the invoice — the UTXO is decrypted and withdrawn via Cloak to that wallet

**To test Bearer Invoices (the marquee feature):**
1. From the vault, click **Invoice** → switch mode to **Bearer link** → set amount and a short expiry
2. Create the proposal, approve, and execute as a multisig member
3. The operator runs the Cloak deposit from the Operator tab as in any private send
4. Open the claim link in an incognito window connected with **any** devnet wallet (no recipient was committed at create time)
5. Click Claim — the funds settle into whichever wallet you connected at claim time

**To test Recurring Payments:**
1. Click **Recurring** → New schedule → choose Privacy (Private routes through Cloak, Public is a vault transfer)
2. Pick cadence (monthly is the default), amount, recipient, and first due date
3. The schedule lands under either "Due now" (if the date is today / past) or "Upcoming"
4. Click **Run now** to create the proposal for this cycle. If you click before the due date you'll see a confirmation modal. After the run, `nextDueAt` rolls forward by one cadence period and `lastRunAt` updates instantly
5. Approve and execute the proposal in the Transactions tab as you would any other private send

**To test Audit Links and signed exports:**
1. From the vault, click **Audit** → create a link with the scope you want
2. Copy the link and open it in an incognito window — that view is recorded in the access log
3. Back in the admin, expand the link row to see "Access log" with the IP and timestamp of each view and export
4. Download the CSV or JSON; open the file and confirm the `# signature=` header (CSV) or signature wrapper (JSON). The signature can be verified offline against the Aegis backend public key

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

**Recurring contributor retainer:** The DAO sets up monthly Aegis recurring schedules per contributor, each labeled and tagged with a cadence. Every cycle the treasurer clicks Run on the dashboard, the proposal lands in the Squads queue, members approve, and the operator routes the payment through Cloak. The schedule's `lastRunAt` and `nextDueAt` update automatically, so the team has a clean ledger of who got paid when without any of those payments showing on-chain in plaintext.

**Vendor Payment:** A protocol pays an auditing firm 50 SOL for a security review. The payment amount and the auditor's wallet are competitively sensitive. Aegis routes the payment through Cloak after multisig approval — the vendor receives SOL privately, with a stealth invoice as the delivery mechanism.

**Bearer invoice on a vendor portal:** A contractor lists their services on a public website and wants to accept private crypto payments without doxxing a wallet. They post a bearer Aegis claim link. A buyer opens the link, connects whichever wallet they want to pay from, and on the contractor's side a separate wallet (revealed only at claim time) collects the funds. The on-chain trace shows nothing connecting the contractor's website to their actual treasury wallet.

**Investment:** A treasury DAO wants to acquire a large token position OTC. Broadcasting the vault address as the buyer would move the market. The Cloak-routed payment keeps the buyer identity off the public trace until settlement.

**Selective regulator disclosure:** A foundation's accountant needs to file quarterly reports. The treasurer issues a `time_ranged` audit link scoped to Q2 with a 30-day expiry. The accountant downloads a CSV; every download is recorded in the access log with IP and timestamp, and the CSV carries an Ed25519 signature header bound to the link ID, so the auditor's report is tamper-evident even after handoff.

---

## How It Works

```
1. A member proposes a private payment (send, payroll, or stealth invoice).
2. Squads members approve through the normal threshold flow.
3. On execution, the vault atomically:
   (a) transfers the payment amount from the vault PDA to the operator wallet
   (b) calls the gatekeeper, which issues a time-limited, hash-locked license
4. The operator deposits the just-received funds into the Cloak shield pool (transact).
5. The operator consumes the license and routes the withdrawal to the recipient (fullWithdraw).
   The on-chain trace shows: vault → operator → Cloak pool → recipient.
   No on-chain proof links the vault deposit to the recipient withdrawal —
   that link is broken by the Cloak shield pool's anonymity set.
```

### Privacy Model: What's Hidden, What's Visible

Aegis is honest about its threat model. An on-chain observer can see each hop, but cannot prove correlation between the vault and the recipient.

| Step | Visible on-chain | Hidden |
|---|---|---|
| Proposal creation | Squads tx index, member signers | Recipient address, amount intent (only commitment hash) |
| Proposal execution | `Vault → Operator: amount` | — |
| Cloak deposit | `Operator → Cloak pool: amount` | UTXO contents, recipient |
| Cloak withdraw | `Cloak pool → Recipient: amount` | Origin UTXO, depositor |
| **Net effect** | Vault and recipient are **not correlatable** without breaking the Groth16 proof system | — |

The privacy guarantee is the same as any zk-SNARK shield pool: it depends on the **anonymity set** of the Cloak pool, not on hiding the operator hop. The operator is a known, public relay — that's by design. What the operator cannot do is link a specific vault deposit to a specific recipient withdrawal.

---

## Compliance & Auditability

Aegis is designed around **confidentiality, not anonymity** — the framing the Solana Foundation adopted in its March 2026 enterprise privacy framework. That distinction matters for real-world adoption: full anonymity carries regulatory risk; confidentiality with selective disclosure is defensible for payroll, B2B payments, and institutional treasury operations.

Every privacy feature in Aegis includes a corresponding auditability mechanism:

| Feature | Confidentiality | Auditability mechanism |
|---|---|---|
| Private Send | Recipient and amount hidden from public | Proposer retains UTXO private key; can prove payment to auditor |
| Payroll Batches | Individual salaries not visible on-chain | Operator log + per-recipient execution receipts |
| Stealth Invoices (bound) | Vendor wallet not exposed in proposal | Invoice record in vault DB; auditor link reveals claimant |
| Stealth Invoices (bearer) | No recipient committed at create time, only the amount and a hash of the link secret | Claim record captures the destination wallet + claim time + IP; auditor link reveals where the funds actually settled |
| Recurring Payments | Per-cycle proposals identical to a one-shot private send (private mode) or a public Squads transfer (public mode) | Schedule history in vault DB tracks each run; per-cycle proposal references back to the schedule label |
| Audit Links | No public exposure of the underlying ledger | Time-limited, scoped read access granted to accountant or regulator; revocable anytime |
| Audit Access Log | Auditor activity is itself private to the vault | Every view and export is recorded with action, IP, and timestamp; surfaced under each link in the admin |
| Signed Exports | Tamper-evident snapshots | CSV and JSON downloads carry an Ed25519 signature covering `signedAt + vault + linkId + body`; offline-verifiable against the Aegis backend public key |

Audit links support granular access controls: `amounts_only`, `time_ranged`, and `full_history` scopes — so a treasury can share exactly what a regulator needs, nothing more. Each link is Ed25519-signed and expires automatically.

This architecture means Aegis private payments are not a black box. They are *selectively transparent* — hidden from the public chain, but auditable by parties the vault explicitly authorizes.

---

## Built on Squads Protocol

Aegis is built on top of **Squads Protocol v4** using the `@sqds/multisig` SDK (v2.1.4). We do not replace or reimplement Squads — we extend it.

### What Squads gives you (the foundation)

- Multisig vault creation and management
- N-of-M threshold proposals and voting
- Transaction execution via the Squads vault PDA
- Member management and role configuration

### What Aegis adds on top (the privacy layer)

- **Privacy via Cloak** — zero-knowledge shield pool routing that breaks the on-chain link between your vault and recipients
- **Payroll automation** — CSV import, batch proposals, and per-recipient execution
- **Stealth invoicing** — secret claim links where recipients withdraw without exposing their wallet
- **Bearer invoices** — issue a claim link with no recipient wallet at all; whoever opens the link picks where the funds settle at claim time, the same way Request Finance email links work but routed through Cloak
- **Recurring payments** — schedule monthly retainers, biweekly payroll, or quarterly vendor payments with cadence tracking; each cycle is one-click executed, public or private per schedule
- **Scoped audit links with verifiable exports** — time-limited, revocable read access for accountants and regulators; every CSV/JSON export is Ed25519-signed by the Aegis backend so auditors can verify provenance offline, and an on-page access log records every view and download
- **Selective disclosure receipts** — proposers retain UTXO keys and can hand a regulator everything needed to reconstruct one specific payment without revealing the rest

Your existing Squads vault, members, thresholds, and approval flow remain completely unchanged. Aegis proposals are standard Squads vault transactions that call the Aegis gatekeeper program. The same gatekeeper licensing model is designed to be integrated by Realms and custom multisig protocols via CPI — Squads is the first integration, not the last.

- **Squads:** [https://squads.so](https://squads.so)
- **Squads docs:** [https://docs.squads.so](https://docs.squads.so)

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
| Stealth Invoices (bound) | Devnet | Secret claim links — recipient decrypts UTXO and withdraws via Cloak SDK |
| Stealth Invoices (bearer) | Devnet | Same flow without binding a recipient wallet; whoever opens the link chooses the destination at claim time. Default 24h expiry with explicit "bearer cash" warning in the UI |
| Recurring Payments | Devnet | Schedule weekly / biweekly / monthly / quarterly payouts; one-click Run creates a fresh proposal each cycle. Public or private per schedule, with monthly outflow KPI strip and overdue indicators |
| Audit Links | Devnet | Scoped (full / amounts only / time-ranged), revocable read access for accountants and regulators |
| Audit Access Log | Devnet | Every view and export is recorded with IP and timestamp; the admin sees who opened the link and when |
| Signed Audit Exports | Devnet | CSV and JSON exports are Ed25519-signed by the Aegis backend; signature header on the file so auditors verify offline |
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

### Variant flows

**Bearer invoice:** identical to the diagram above except (a) the proposal is created with `recipientVkPub` derived from a server-generated stealth keypair instead of a known recipient wallet, and (b) `fullWithdraw()` runs from the **claim page in the recipient's browser**, not the operator's. Whoever opens the claim link with the secret in the URL fragment chooses the destination wallet at claim time.

**Recurring payments:** the recurring schedule is metadata in PostgreSQL only — no on-chain state. Clicking **Run now** at the cycle boundary creates a fresh proposal. For `privacy: "private"` schedules the proposal mirrors the private-send diagram; for `privacy: "public"` it's a plain `SystemProgram.transfer`. The endpoint advances `nextDueAt` by one cadence period, returns the new state, and the UI patches optimistically.

**Audit access log:** every GET on `/audit/[linkId]` and every POST to `/audit/[linkId]/export` writes to `AuditAccessLog` (rate-limited to 1 entry / IP / minute / action / link). Exports are signed with Ed25519 by the backend; the signature covers `signedAt | vault | linkId | data` and is embedded in a CSV header or JSON wrapper.

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
# Required: DATABASE_URL, JWT_SIGNING_SECRET, NEXT_PUBLIC_RPC_URL
# Optional but recommended: AUDIT_EXPORT_SIGN_KEY (base64 of 32 bytes;
# falls back to a JWT-derived seed when missing), REDIS_URL + REDIS_TOKEN
# for distributed rate limiting

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

> **Tip:** the Prisma CLI reads `apps/web/.env`, not `.env.local`. Either symlink (`ln -s .env.local apps/web/.env`) or run prisma commands with `set -a; . apps/web/.env.local; set +a;` prefixed.

Open [http://localhost:3000](http://localhost:3000), connect a **devnet wallet** (Phantom or Solflare), and create or import a Squads multisig.

**For production deploys** use `pnpm -F web prisma migrate deploy` instead of `migrate dev` so the runner doesn't try to reset the database on missing migrations.

To test the full private send flow you need two devnet wallets: one as a multisig member/proposer and one as the registered operator. The operator wallet only needs devnet SOL for transaction fees (~0.05 SOL is plenty) — the vault auto-funds the payment amount into the operator wallet as part of the proposal execution.

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
| Frontend | Next.js 15 (App Router), React, Tailwind CSS, Framer Motion |
| Wallets | Solana Wallet Adapter (Phantom, Solflare) |
| Multisig | `@sqds/multisig` v2.1.4 (Squads v4) |
| Privacy | `@cloak.dev/sdk-devnet` — `transact`, `fullWithdraw`, `generateUtxoKeypair`, `computeUtxoCommitment`, `derivePublicKey`, `cloakDepositBrowser` |
| Crypto primitives | `tweetnacl` (Ed25519 + NaCl box for memo encryption and audit signing), `@noble/hashes` (Blake3), Poseidon (via Cloak SDK) |
| Auth | Session-cookie wallet auth with JWT-signed httpOnly cookies (one `signMessage` per 30 minutes) |
| Data | Prisma + PostgreSQL, Upstash Redis for rate limiting |
| State | TanStack Query (server state), zustand (wizard state), localStorage (link history) |
| UI primitives | Radix UI (Dialog, Tooltip), shadcn-style component conventions, Number Flow for animated metrics |
| Monorepo | pnpm workspaces, Turborepo |
| Testing | Vitest (unit), anchor-bankrun (integration) |
| Lint / format | Biome |

---

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm -F web dev` | Start the Next.js dev server |
| `pnpm prebuild:web` | Typecheck core + web |
| `pnpm build:web` | Full production build |
| `pnpm -F web prisma generate` | Regenerate the Prisma client after schema edits |
| `pnpm -F web prisma migrate dev` | Apply migrations to a local dev database |
| `pnpm -F web prisma migrate deploy` | Apply migrations in production (no schema drift checks) |
| `pnpm lint` | Biome lint checks |
| `pnpm -w biome check --write <paths>` | Auto-format and fix |
| `pnpm test:unit` | Vitest unit tests |
| `pnpm test:int` | anchor-bankrun integration tests |
| `pnpm test:all` | Run all tests |
| `pnpm seed:demo` | Seed demo data and devnet cofre |
| `pnpm deploy:gk -- --cluster devnet` | Deploy gatekeeper program |

---

## Vault → Operator Auto-Funding

The Squads Vault PDA is program-owned and cannot sign arbitrary outbound transactions — including Cloak's `transact()` deposit. Aegis solves this transparently in a single approved proposal:

1. The proposal Squads members approve **already includes** a vault → operator SOL transfer for the exact payment amount.
2. When the proposal executes, the gatekeeper issues the license **and** the vault funds land in the operator wallet atomically.
3. The operator (which can already sign transactions because it's a regular wallet) immediately deposits those funds into the Cloak shield pool.

**Result:** from the user's perspective, private sends behave identically to public sends — the vault balance funds the payment, no separate operator funding ceremony is required. The operator only needs SOL for transaction fees (~0.05 SOL covers many executions).

**For USDC and other SPL tokens:** the proposal pre-funds the operator's associated token account in the same atomic execution.

This is the cleanest possible design given the program-owned vault constraint, without waiting for upstream Cloak CPI support.

---

## Roadmap

### Done — Devnet
- [x] Private send via Cloak shield pool
- [x] Atomic vault → operator auto-funding in a single approved execution
- [x] Payroll batches (CSV upload, per-recipient operator execution, up to 10 recipients)
- [x] Stealth invoices with secret claim links (bound mode)
- [x] Bearer invoices: claim links with no recipient wallet committed at create time
- [x] Recurring payments: weekly/biweekly/monthly/quarterly schedules with per-cycle one-click run, public or private per schedule
- [x] Scoped audit links (Ed25519-signed, time-limited, revocable)
- [x] Audit access log: every view and export captured with IP + timestamp, surfaced in the admin
- [x] Server-signed audit exports: CSV and JSON downloads carry an Ed25519 signature header for offline verification
- [x] Token swap proposals (SOL ↔ USDC via Raydium / Orca)
- [x] Vault import from existing Squads multisigs
- [x] Member management (add/remove, change threshold)
- [x] Address book, webhook settings, per-vault RPC override
- [x] Membership checks on every write API endpoint (`requireVaultMember` / `requireVaultOperator` middleware)
- [x] Operator-only gate for sensitive UTXO data (`commitmentClaim`, `utxoPrivateKey`, `utxoBlinding`)
- [x] UTXO private keys and blinding factors encrypted at rest in PostgreSQL
- [x] Challenge-response with one-time challenge HMAC for stealth invoice claims
- [x] Distributed rate limiting via Upstash Redis (with in-memory fallback)
- [x] Session-cookie wallet auth (one `signMessage` per 30 minutes via httpOnly cookie)
- [x] Operator on-curve guard (rejects vault PDA destinations before deposit, except in invoice mode)

### Next — Tier 2 (paridade Squads + privacy depth)
- [ ] **Time locks** — UI in Settings + `createSetTimeLockProposal`; Squads v4 supports it natively, no on-chain change needed
- [ ] **Custom roles** — DB-overlay permission model (admin / proposer / executor / viewer)
- [ ] **Sub-vault gatekeeper parametrization** — `vault_index` parameter on the gatekeeper handlers; unlocks private ops in sub-vaults and recurring auto-cron (Anchor change + redeploy)
- [ ] **Privacy bridge for spending limits** — limit-use deposits into Cloak instead of public transfer (depends on the gatekeeper change above)
- [ ] **Recurring auto-cron** — background runner to fire schedules without a manual click (depends on gatekeeper change)
- [ ] **Multi-operator failover** — backup operator + heartbeat so an offline primary doesn't freeze the queue
- [ ] **Proof-of-payment exports** — Groth16 witness export so an auditor can cryptographically verify a single payment

### Mainnet readiness
- [ ] Dedicated RPC (Helius / QuickNode) + managed PostgreSQL with backups
- [ ] Mainnet Cloak API parity validation
- [ ] Gatekeeper program security audit (Neodyme / OtterSec class)
- [ ] 2-of-N hardening — co-signer verification of `commitmentClaim` payloads
- [ ] `AUDIT_EXPORT_SIGN_KEY` rotation story + per-vault signing keys

### Later — Ecosystem
- [ ] SPL token privacy — USDC and other tokens through Cloak (dependent on Cloak protocol support)
- [ ] Aegis MCP server — vault operations for AI agents with human-in-the-loop gate
- [ ] Streamflow integration — vesting and salary streams routed through Cloak
- [ ] Sphere fiat off-ramp — operator off-ramps confirmed deposits to USD
- [ ] Mobile-first PWA — claim flow optimized for mobile wallet adapter + QR scan
- [ ] Realms / Governance integration via CPI
- [ ] Cloak CPI — program-signed deposit eliminating the operator hop

---

## Project Status

**Devnet, feature-complete on Tier 1.** Private send, payroll, stealth invoices (bound + bearer), recurring payments (public + private), scoped audit links with signed exports and access log are all functional end-to-end on [aegisz.xyz](https://aegisz.xyz). Authentication uses session cookies with one wallet signature per 30 minutes; sensitive UTXO fields are encrypted at rest in PostgreSQL; rate limits are backed by Upstash Redis.

Tier 2 work (time locks, custom roles, sub-vault gatekeeper parametrization, multi-operator failover) is specced in [`docs/specs/2026-05-06-feature-roadmap-improvements.md`](docs/specs/2026-05-06-feature-roadmap-improvements.md). Mainnet deployment is gated on the gatekeeper security audit and Cloak mainnet API parity, both tracked in the roadmap below.

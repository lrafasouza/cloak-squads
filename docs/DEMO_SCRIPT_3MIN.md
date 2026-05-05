# Demo Script — Aegis (3-Minute Cut)

**Target duration:** 3 minutes  
**Format:** narrated demo with product decisions and architecture explained  
**Goal:** show the product works, but mainly explain *why* it was built this way.

---

## [0:00 – 0:10] Personal Intro

**Screen:** Webcam or picture-in-picture overlay

**Script:**

Hey, I'm [your name]. This is Aegis — a privacy layer for Squads treasuries on Solana. In this demo I'll show it live: creating a vault, approving a private payment, and executing it through Cloak.

---

## [0:10 – 0:25] Hook — The Problem

**Screen:** Landing page / hero section

**Script:**

Every Squads vault transfer is public by default. Anyone with a block explorer can see the recipient, the amount, and sometimes even the memo.

That means payroll, vendor payments, and treasury movements are all exposed. Aegis solves that — not by replacing multisig governance, but by adding a private execution layer around approved payments.

---

## [0:25 – 0:50] Creating the Vault

**Screen:** Click `Create Vault` and move quickly through the wizard

**Script:**

I'm creating a new vault connected to Aegis. The key idea: Aegis is not a new multisig product. Teams keep their governance, thresholds, and approval flow.

What Aegis adds is private execution *after* approval. In the future, existing Squads vaults will be importable too.

Here I set the members and threshold. For speed I'm using 1-of-1, but real teams configure N-of-M.

Now the operator. This is a separate wallet — not a vault member. The team approves *what* gets paid. The operator executes *how* it gets paid. Different trust domains.

The operator can't move funds alone. It needs a license issued by the gatekeeper program after approval. Also, the Cloak deposit is currently funded by the operator wallet — the vault PDA can't sign Cloak transactions directly. We're fixing that.

---

## [0:50 – 1:00] Dashboard Overview

**Screen:** Vault dashboard

**Script:**

This is the dashboard. Vault balance, members, proposals. There's also scoped audit access for accountants and regulators.

The flow I want to show is the private send — where the team approves a payment without exposing recipient, amount, or context on-chain.

---

## [1:00 – 2:30] Private Send — Main Flow

**Screen:** Click `Private Send`

### Filling the Payment

**Screen:** Fill recipient and amount

**Script:**

I'm creating a private payment. Before submission, the client generates a UTXO keypair and computes a Poseidon commitment hash. This commitment binds the payment details to the license that will be created later.

So the system has cryptographic proof of what is approved, without exposing the details publicly. The license only works with the matching UTXO data. Without it, the license is useless.

### Creating & Approving the Proposal

**Screen:** Click `Submit`, show proposal, then approve

**Script:**

Aegis creates a proposal. The team must approve before private execution happens. Privacy is not a shortcut around treasury controls.

The flow is: propose, approve through governance, then execute privately. After approval, the vault calls the gatekeeper, which issues a time-limited, single-use license. Short TTL, no replay.

For this demo it's 1-of-1, so instant. The operator still can't do anything before this approval.

### Operator Execution

**Screen:** Operator Dashboard, click `Execute`

**Script:**

Now the operator takes over. First, deposit into the Cloak shield pool using `transact()`.

On screen: the ZK proof generating locally in the browser via WASM. No server sees this data. We proxy the Cloak relay for CORS, but the sensitive cryptographic work stays on the client.

After deposit, the operator consumes the license on-chain — it burns and prevents replay. Then `fullWithdraw()` unshields funds directly to the recipient.

The recipient gets SOL. An outside observer sees operator → Cloak pool, and Cloak pool → recipient. The vault is no longer in the trace.

That is the core value: approved treasury payments with private execution.

---

## [2:30 – 2:50] Stealth Invoices

**Screen:** Invoice page, create invoice, show link, open incognito and claim

**Script:**

Aegis also does stealth invoices. The vault creates a secret claim link. The recipient opens it, proves ownership, and withdraws via Cloak.

The vendor's wallet never appears in the proposal. Useful for payroll, contractors, and sensitive operational payments.

---

## [2:50 – 3:00] Closing

**Screen:** Back to dashboard

**Script:**

Aegis is not a new multisig. It's a privacy execution layer around multisig approvals.

Cloak handles the shield pool and ZK proofs. The gatekeeper connects approval to execution. The license model ensures every private payment was approved first, used once, and cannot be replayed.

Open source at `github.com/lrafasouza/aegis`.

---

# Notes for Recording

- Start with yourself on screen (webcam or picture-in-picture). Judges connect more when they know who is speaking.
- The most important section is `Private Send`, from around `1:00` to `2:30`. Do not rush the license model explanation.
- Speak while you click. Show the product working live.
- Point at the ZK proof progress bar on screen.
- Mention proof generation is client-side.
- Be transparent that existing Squads vault import and operator funding UX are works in progress.
- Use 1080p minimum. Loom is fine. OBS is better for browser + terminal.

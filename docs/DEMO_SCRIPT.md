# Demo Script — Aegis

**Target duration:** approximately 4 minutes  
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

For this demo I'll create a new Aegis-connected vault. Existing Squads vault import is coming soon.

---

## [0:25 – 0:55] Creating the Vault

**Screen:** Click `Create Vault` and move quickly through the wizard

**Script:**

I'm creating a new vault connected to Aegis. The key idea: Aegis is not a new multisig product. Teams keep their governance, thresholds, and approval flow.

What Aegis adds is private execution *after* approval. In the future, existing Squads vaults will be importable too.

Here I set the members and threshold. For speed I'm using 1-of-1, but real teams configure N-of-M.

Now the operator — a separate wallet, not a vault member. The team approves *what* gets paid. The operator executes *how* it gets paid. Different trust domains.

The operator can't move funds alone. It needs a license issued by the gatekeeper after approval. Also, the Cloak deposit is currently funded by the operator wallet — the vault PDA can't sign Cloak transactions directly. We're fixing that.

---

## [0:55 – 1:05] Dashboard Overview

**Screen:** Vault dashboard with balance, members and proposals

**Script:**

This is the dashboard — vault balance, members, proposals. There's also scoped audit access for accountants and regulators.

The flow I want to show is the private send: approve a payment without exposing recipient, amount, or context on-chain.

---

## [1:05 – 2:50] Private Send — Main Flow

**Screen:** Click `Private Send`

### Filling the Payment

**Screen:** Fill recipient and amount

**Script:**

I'm creating a private payment. Before submission, the client generates a UTXO keypair and computes a Poseidon commitment hash. This binds the payment details to the license that will be created later.

The system has cryptographic proof of what is approved, without exposing details publicly. The license only works with the matching UTXO data — without it, the license is useless.

### Creating & Approving the Proposal

**Screen:** Click `Submit`, show proposal, then approve

**Script:**

Aegis creates a proposal. The team must approve before private execution happens. Privacy is not a shortcut around treasury controls.

The flow: propose, approve through governance, then execute privately. After approval, the vault calls the gatekeeper, which issues a time-limited, single-use license. Short TTL, no replay.

For this demo it's 1-of-1, so instant. The operator still can't execute before this approval.

### Operator Execution

**Screen:** Go to Operator Dashboard and click `Execute`

**Script:**

Now the operator takes over. First, deposit into the Cloak shield pool using `transact()`.

On screen: the ZK proof generating locally in the browser via WASM. No server sees this data. We proxy the Cloak relay for CORS, but the sensitive cryptographic work stays on the client.

After deposit, the operator consumes the license on-chain — it burns and prevents replay. Then `fullWithdraw()` unshields funds directly to the recipient.

The recipient gets SOL. An outside observer sees operator → Cloak pool, and Cloak pool → recipient. The vault is no longer in the trace.

That is the core value: approved treasury payments with private execution.

---

## [2:50 – 3:10] Stealth Invoices

**Screen:** Invoice page, create invoice, show link, open incognito and claim

**Script:**

Aegis also does stealth invoices. The vault creates a secret claim link. The recipient opens it, proves ownership, and withdraws via Cloak.

The vendor's wallet never appears in the proposal. Useful for payroll, contractors, and sensitive operational payments.

---

## [3:10 – 3:25] Payroll Batch

**Screen:** Payroll page with CSV upload and proposal creation

**Script:**

For recurring payments, Aegis supports batch payroll. Upload a CSV with multiple recipients and amounts, then generate one approval flow with a license per recipient.

The execution per recipient is the same private send we just saw — repeated for each row. The goal is to make private treasury operations practical, not just technically possible.

---

## [3:25 – 3:45] Closing — Architecture and Next Steps

**Screen:** Back to dashboard or landing page

**Script:**

The core decision behind Aegis: we're not building a new multisig. We're building a privacy execution layer around multisig approvals.

Today it works by creating a new Aegis-connected vault. Next step: importing existing Squads vaults.

Cloak handles the shield pool and ZK proofs. The gatekeeper connects approval to execution. The license model ensures every private payment was approved first, used once, and cannot be replayed.

Open source at `github.com/lrafasouza/aegis`.

---

# Notes for Recording

- Start with yourself on screen (webcam or picture-in-picture). Judges connect more when they know who is speaking.
- The most important section is `Private Send`, from around `1:05` to `2:50`.
- Speak while you click. Don't narrate over a static screen — show the product working live.
- Do not rush the explanation of the license model.
- Show the ZK proof generation clearly on screen — point at the progress bar / percentage indicator.
- Mention that proof generation is client-side.
- Make clear that the operator does not approve payments, it only executes approved payments.
- Be transparent that existing Squads vault import is not live yet.
- Phrase it as a roadmap direction, not as a current feature.
- Use 1080p minimum.
- Loom is fine for speed. OBS is better if you want browser + terminal.

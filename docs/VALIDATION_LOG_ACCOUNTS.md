# Accounts Feature — Validation Log

**Started:** 2026-05-06
**Test target multisig:** `5hrqqkcaf7Xsx2gR7mFouBSXSGS1jtK1EGwV6NVnHpG2` (real, with sub-vault "Jetsul")

This log is the single source of truth for what was actually verified vs what is still hypothetical.

---

## 🛑 BUG-6 — Private ops from sub-vault are architecturally impossible (2026-05-06 ~22:00)

**Reported by user:** payroll proposal #23 (Jetsul → recipients) was created and approved, but `VaultTransactionExecute` fails with:

```
Program SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf invoke [1]
Program log: Instruction: VaultTransactionExecute
Program log: AnchorError thrown in programs/squads_multisig_program/src/utils/executable_transaction_message.rs:91.
              Error Code: InvalidAccount. Error Number: 6014.
              Error Message: Invalid account provided.
custom program error: 0x177e
```

### Root cause — two constraints that compound

1. **Aegis gatekeeper hardcodes vault index 0 as the required CPI signer.**
   `programs/cloak-gatekeeper/src/instructions/issue_license.rs:14`:
   ```rust
   verify_squads_vault_signer(&ctx.accounts.cofre.multisig, 0, &ctx.accounts.squads_vault)?;
   ```
   So *any* `issue_license` CPI must be signed by the **Primary** vault PDA, regardless of which vault originated the spend. (Same hardcoded `0` in `init_cofre`, `set_operator`, `revoke_audit`, `add_signer_view`, `remove_signer_view`, `emergency_close_license`, `init_view_distribution`.)

2. **Squads on-chain validates that signers in the inner message must be the source vault or an ephemeral signer.**
   `executable_transaction_message.rs:91` rejects with `InvalidAccount` (6014 / 0x177e) any account marked `is_signer = true` in the stored inner message that isn't either:
   - the vault PDA derived from `multisig + transaction.vault_index`, OR
   - one of the transaction's ephemeral signer PDAs.

   When a proposal is created with `vaultIndex = 1` (Jetsul) but its inner message includes an `issue_license` ix that marks Primary (index 0) as signer — Squads rejects it before the gatekeeper even runs.

### Why it didn't surface in proposal #20

Proposal #20 was a plain `SystemProgram::transfer` Primary → Jetsul. No gatekeeper CPI in the inner message → no foreign vault signer → no constraint conflict. **Public** sub-vault sends work; **private** ones cannot.

### Affected flows

| Flow | Uses gatekeeper? | Status from sub-vault |
|---|---|---|
| Send Public (external or vault-to-vault) | No | ✅ Works |
| Swap (Raydium) | No | ✅ Works |
| Receive (read-only PDA) | No | ✅ Works |
| Send Private | Yes (`issue_license`) | 🛑 Fails on execute |
| Payroll (any mode — direct or invoice) | Yes (every recipient gets a license) | 🛑 Fails on execute |
| Invoice (stealth) | Yes (`issue_license`) | 🛑 Fails on execute |

### Workaround applied — front-end lock (commit `5aee013`)

- `SendModal`: `mode === "private"` → `useEffect` snaps `selectedVaultIndex` to 0; non-Primary buttons in the source picker render `disabled` with tooltip; hard guard at submit returns a clear error.
- `Payroll`: source picker removed entirely; `vaultIndex` hardcoded to 0; banner surfaces the constraint when sub-vaults exist.
- `Invoice`: same pattern as Payroll — picker removed, `vaultIndex = 0`, inline note.

Public/Swap/Receive remain free to use any sub-vault. Sub-vaults are still useful as named accounts for separating funds with public flows.

### Permanent fix — parametrize the gatekeeper (deferred)

To unblock private operations from sub-vaults, change the gatekeeper to accept any vault index of the multisig:

1. Add `vault_index: u8` as an instruction-data argument to the 8 affected handlers (`utils.rs::verify_squads_vault_signer` already accepts it; the handlers just pass `0`).
2. Update `apps/web/lib/gatekeeper-instructions.ts::buildIssueLicenseIxBrowser` — function already takes `vaultIndex`; just needs to encode it in the instruction data buffer.
3. Update `packages/core/src/gatekeeper-client.ts::buildIssueLicenseIx` — pass `vaultIndex` via `program.methods.issueLicense(...)`.
4. Thread `vaultIndex` through callers in `payroll/`, `send/`, `invoice/`, and integration tests + scripts.
5. Bump program, `anchor build`, `solana program deploy` (preserve program ID `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq` — same upgrade authority).

Estimated: ~4h dev + 30min deploy. Not started — UI lock is sufficient for now.

### Stuck proposal #23

Left in `Approved` state on multisig `5hrqq...HpG2`. Cannot execute. Will be cancelled/refunded manually — no action item for code.

---

## ✅ END-TO-END VALIDATED (2026-05-06 ~18:30)

**Vault-to-vault Public transfer worked.** Proposal #20: 0.2 SOL Primary → Jetsul.
- Pre: Primary 1.601626 SOL, Jetsul 0.500000 SOL
- Post: Primary 1.399774 SOL, Jetsul 0.700000 SOL
- Proposal #20 status on-chain: `Executed`
- Create signature: `2Yw284tXbgbtJTkww1YkSu5L8uaswVmuyj7QEwhHZYTYsCf9TA2JGSk7T5RrNZDaoeRKNv6cMyfSYkZeG4ed4K2j`

This validates: source-account picker works, destination toggle "Another account" works, public-mode vault-to-vault is real, propose+approve+execute flow works for sub-vault PDAs as recipients.

### Console noise during the successful run (all benign)
| Symptom | Cause | Action |
|---|---|---|
| `429 Too Many Requests` retries | devnet RPC throttling | None — exponential backoff (500/1000/2000ms) handles it |
| `/api/swaps/.../20 → 404` | proposal #20 is a plain vault transfer, not a swap draft | Expected; UI tries all 3 draft endpoints to detect type |
| `/api/payrolls/.../20 → 404` | same — not a payroll draft | Expected |
| `/api/proposals/.../20 → 404` | same — not a private-send draft | Expected |
| `/apple-touch-icon.png 404` | missing iOS favicon | Cosmetic; can add later |
| `1 signed proposal was executed by another member.` | misleading copy — was firing for own executions too | **FIXED** — now just says "1 signed proposal executed." |

---

## What was validated (2026-05-06)

### ✅ Boot and infrastructure

- Dev server boots clean (port 3002, after collisions on 3000/3001)
- Next.js 15.1.0 ready in 1.6s
- TypeScript compiles clean (`npx tsc --noEmit` → no errors in changed files)
- DB connection works (Postgres on `localhost:5432/aegis_dev`)
- All Prisma queries against real schema return correct shape

### ✅ APIs return correct data (real, not theater)

| Endpoint | Status | What was verified |
|---|---|---|
| `GET /api/cloak/pool-stats` | 200 | SOL: `anonymitySetTotal=988`, `poolDepthLamports=890880`, `riskScore=medium`. Real on-chain Cloak Merkle tree state. |
| `GET /api/cloak/pool-stats?mint=USDC` | 200 | USDC pool not initialized (anonymitySetTotal=0, riskScore=high). Honest. |
| `GET /api/vaults/{m}/sub-vaults` | 200 | Returns `[{ vaultIndex: 1, name: "Jetsul" }]` |
| `GET /api/vaults/{m}/spending-limits` | 200 | Returns 1 limit at vaultIndex=0, 2 SOL/day, member matches user wallet |
| `GET /api/vaults/{m}/income?limit=3` | 200 | Returns `{ entries: [] }` (no recent vault income) |

### ✅ On-chain reality matches DB

| Item | DB | On-chain | Match? |
|---|---|---|---|
| Spending limit `DKWS...gAh` | status=active, vaultIndex=0, 2 SOL/day | Account exists at PDA, owner = Squads program, vaultIndex=0, amount=2_000_000_000, period=Day | ✅ |
| Sub-vault Jetsul | vaultIndex=1, name=Jetsul | PDA `As56...JNm` has 0.5 SOL | ✅ |
| Primary vault | (derived) | PDA `wbBH...hrB` has 1.6 SOL | ✅ |

### ✅ All vault routes respond 200

`/`, `/sub-vaults`, `/limits`, `/privacy`, `/send`, `/audit` — every one returns HTTP 200 from the dev server.

### ✅ New components are bundled in JS chunks

Verified by grep against `.next/static/chunks/`:

| String | Found in | Confirms |
|---|---|---|
| `From account` | sub-vaults/page.js, send/page.js | Source picker compiled |
| `Another account` | sub-vaults/page.js | Destination toggle compiled |
| `External address` | sub-vaults/page.js | Destination toggle compiled |
| `onSend` | sub-vaults/page.js | Send button on vault cards compiled |
| `Apply to` | limits/page.js | Spending-limits account picker compiled |
| `formVaultIndex` | limits/page.js | State variable compiled |
| `accountNameByIndex` | limits/page.js | Account-name lookup compiled |
| `allAccounts` | limits/page.js | Account list compiled |
| `Receive into` | vault/[multisig]/page.js (dashboard chunk = where ReceiveModal lives) | New ReceiveModal selector compiled |
| `updatedAt * 100` (truncated) | privacy/page.js | **Confirmed bug — `* 1000` ms→ms is in production bundle** |

### ✅ Auth wall enforced correctly

Without a wallet session cookie:
- All vault sub-pages render the "Connect your wallet" gate (client-side block via AppShell)
- `/api/proposals/*` and `/api/payrolls/*` return 401 (server-side auth)
- `/api/sol-price`, `/api/cloak/pool-stats`, `/api/vaults/.../sub-vaults` are public (200) — correct

---

## ⚠️ What was NOT validated (requires the user's wallet)

The auth wall blocks headless rendering of authenticated content. The following require **manual testing in a browser with the user's wallet connected**:

### Sub-vault flows
1. **Open `/sub-vaults`**
   - Expected: Primary card with badge "Default", "Send" + "Receive" arrows, balance ~1.6 SOL. Jetsul card with balance ~0.5 SOL, Send + Trash buttons.
2. **Click Send on Jetsul card**
   - Expected: SendModal opens with "From account" pills showing "Primary | Jetsul" with **Jetsul pre-selected**.
   - Available balance shown: ~0.5 SOL (Jetsul, not primary).
3. **In SendModal, click "Another account" toggle**
   - Expected: pill row shows "To Primary" only (Jetsul filtered out as source). Click "To Primary" — recipient field auto-fills with Primary PDA `wbBHxAgNjHE2yb3JVvB1K99xD76H2EEGU94jC9gyhrB`.
4. **Switch source from Jetsul → Primary** while destination is set to Primary
   - Expected: destination clears (can't send to self). User must re-select.
5. **Submit a SOL send from Jetsul → Primary** (vault-to-vault transfer test)
   - Expected: wallet popup, sign, proposal created on-chain. Detail page shows vault transaction.
6. **Approve + Execute** (manual wallet steps)
   - Expected: SOL moves from Jetsul (0.5) to Primary. After execute, Jetsul balance ≈ 0, Primary ≈ 2.1.

### Receive flow
7. **Click "Receive" on dashboard**
   - Expected: ReceiveModal opens. "Receive into" pill row at top with Primary | Jetsul. Default = Primary.
8. **Click Jetsul pill**
   - Expected: QR regenerates, address label changes to "Jetsul address" with PDA `As56rPBCbq1dGVZV3z11mCA8uNzQ5NbCDH8ytBoEpNJm`.

### Spending Limits flow
9. **Open `/limits`** (with the existing 2 SOL/day limit at primary)
   - Expected: card shows "2 SOL · per day · from **Primary**" (NEW: source label).
10. **Click "Add spending limit"**
    - Expected: form shows "Apply to" pill row at top (Primary | Jetsul). Default = Primary.
11. **Pick "Jetsul" then enter 1 SOL / Day**
    - Expected: preview text says "Members can send up to 1 SOL per day from **Jetsul** without a proposal."
12. **Submit** (creates a config proposal — needs threshold approvals to activate)
    - Expected: wallet signs, proposal created. DB records limit with `vaultIndex=1`, `status="active"` (KNOWN BUG — see "Bugs found" below: status will be "active" before the proposal is even approved).
13. **Open SendModal in Public mode from Primary, send 0.5 SOL**
    - Expected: spending limit widget appears (since limit at Primary is matched), "Use limit" checkbox.
14. **Switch source to Jetsul (still public mode)**
    - Expected: spending limit widget DISAPPEARS (limit is for Primary, source is now Jetsul — filter `l.vaultIndex === selectedVaultIndex` correctly excludes it). **This is the P0 #1 fix from earlier session.**

### Privacy
15. **Open `/privacy`**
    - Expected: 3 stat cards (Anonymity set ≈988, Pool depth ≈0.0009 SOL, Risk = Medium).
    - **BUG**: "Updated" timestamp will show absurd date (year ~58000) because of `updatedAt * 1000`. Will fix.
16. **Open SendModal in Private mode + SOL**
    - Expected: PrivacyMeter widget appears showing same stats as Privacy page.

---

## 🐛 Bugs found / confirmed

### BUG-1 ✅ FIXED — Privacy page timestamp bug
- **File:** `apps/web/app/vault/[multisig]/privacy/page.tsx:187`
- **Was:** `new Date(stats.updatedAt * 1000).toLocaleTimeString()` → year 58000
- **Now:** `new Date(stats.updatedAt).toLocaleTimeString()` → real time
- **Status:** Fixed 2026-05-06. TypeScript clean.

### BUG-2 ✅ FIXED — Spending Limits status drift
- **Was:** DB `status: "active"` was set immediately on proposal create, before on-chain approve+execute. SendModal would offer limits that don't exist on-chain → user clicks "Use limit" → tx fails with AccountNotInitialized.
- **Fix applied 2026-05-06:**
  - `GET /api/vaults/{m}/spending-limits` now batch-fetches each `SpendingLimit` PDA via `getMultipleAccountsInfo` and decorates each row with `onChainExists: boolean`.
  - `SendModal.applicableLimit` filter requires `l.onChainExists !== false` — pending limits never get offered.
  - Limits page UI shows yellow "Pending approval" badge for limits where `onChainExists === false`. Icon turns warn-color.
- **Verified live:** real GET against multisig `5hrqq...HpG2` returns `onChainExists: true` for the existing 2 SOL/day limit (which is truly on-chain).
- **Architectural status:** DB still owns labels and createKey for re-derivation; on-chain owns truth about existence. No DB migration needed.

### BUG-2 (legacy entry) ⚠️ Architectural — Spending Limits status drift
- **Issue:** `prisma.spendingLimit.create({ data: { ... status defaults to "active" } })` writes "active" to DB *before* the on-chain config proposal is even approved. Same for remove (DELETE marks "removed" before execute).
- **Symptom:** UI lists pending limits as if active. SendModal shows widget for limits that don't exist on-chain yet → user clicks "Use limit" → tx fails on-chain.
- **In our test data:** the existing 2 SOL/day limit IS truly active on-chain (verified). But the next limit a user creates will hit this bug.
- **Fix needed:** read on-chain account existence as truth, not DB status. Show "Pending — N/M approvals" badge.

### BUG-3 ✅ FIXED — `Cannot read properties of undefined (reading 'call')`
- **Symptom:** Page-level webpack runtime error in browser when loading dashboard.
- **Real cause:** **3 simultaneous dev servers** were running (PIDs 30813 from 9:47AM, 46812 from 2:44PM, 47914 from 2:52PM) on ports 3000, 3001, 3002. The user's browser was hitting the OLDEST server (port 3000), whose webpack chunk graph referenced module IDs that didn't exist after my recent file changes.
- **Fix:**
  ```
  pkill -f "next dev"; pkill -f "next-server"
  rm -rf apps/web/.next apps/web/.turbo
  PORT=3000 pnpm dev  # single fresh server
  ```
- **Verified:** re-ran playwright validation — page errors went from 1 to 0 on the dashboard. All 5 routes still 200.
- **Lesson:** in dev, *always* check `ps aux | grep next` before debugging mystery webpack errors. Stale background processes load old chunk manifests and silently break HMR.

### Cosmetic warnings (not blocking)
- `bigint: Failed to load bindings, pure JS will be used` — circomlibjs / Cloak SDK transitive dep, performance hint only
- `Critical dependency: the request of a dependency is an expression` — `web-worker` package via `ffjavascript` → circomlibjs → Cloak SDK. Suppressed warning, doesn't affect runtime.

---

### BUG-5 ✅ FIXED — Operator execute path also missing isOnCurve guard
- **Reported by user 2026-05-06 ~18:30 (after BUG-4 fix in SendModal/send-page).**
- **Symptom:** User retried proposal #18 (with PDA recipient, created BEFORE BUG-4 fix). The Operator's "Execute" flow accepted it again, did a NEW Cloak deposit (signature `kKvskgTf...TiMVXmWH`), then relay rejected delivery again. Each retry deposits MORE SOL into the pool with no recovery.
- **Root cause:** my BUG-4 fix only blocked PROPOSAL CREATION. It did NOT block PROPOSAL EXECUTION. Existing pre-fix proposals could still hit the same path on the operator side.
- **Fix:** `app/vault/[multisig]/operator/page.tsx::executeSingle()` — added an `isOnCurve` guard at the very top, BEFORE `startTransaction` and BEFORE the deposit. If the recipient is off-curve, fail fast with a friendly error directing the user to refund and recreate as Public.
- **Also fixed:** `app/vault/[multisig]/payroll/page.tsx` — added per-recipient `isOnCurve` check in the proposal-creation loop so payroll private sends can't be created with PDA recipients.

### BUG-4 ✅ FIXED (and one stuck deposit) — Private send to PDA architecturally impossible
- **Reported by user during manual testing 2026-05-06 18:00.**
- **Symptom:** SendModal in Private mode + destination "Another account" (Jetsul sub-vault). Vault paid operator, operator deposited 0.1 SOL into Cloak pool, then Cloak relay returned `Validation error: Recipient address is not on the Ed25519 curve (likely a PDA, not a wallet)`. Funds stranded in shielded pool.
- **Root cause:** Cloak relay can only deliver to Ed25519 wallets. Vault PDAs are deliberately off-curve (program-derived). My "Another account" destination toggle let private mode through this combination.
- **Verified on-chain:**
  - Proposal #18 status: `{ __kind: "Executed" }`
  - Vault → operator → Cloak deposit ALL succeeded
  - Only the final operator → recipient delivery failed
- **Fix applied:**
  - `SendModal.tsx`: useEffect forces `mode = "public"` when `destType === "account"`. Private button is `disabled` with tooltip explaining why.
  - `SendModal.tsx` + `send/page.tsx`: runtime guard `PublicKey.isOnCurve(recipientPubkey.toBuffer())` rejects private sends to off-curve recipients with a friendly error before submitting. Covers the case where a user pastes a PDA into the External field.
  - Added explanatory copy: "Vault-to-vault transfers go through Public mode (multisig proposal). Private mode requires an Ed25519 wallet recipient — vault PDAs are off-curve."

#### Recovery data for the stuck 0.1 SOL (saved here for the user)

The 0.1 SOL is in the Cloak shielded pool with a UTXO that the user fully owns. Recovery requires running a one-shot operator script using the UTXO private key + commitment, constructing a withdrawal to a NEW Ed25519 recipient (your wallet, not the PDA).

```
amount:                100000000 lamports (0.1 SOL)
keypairPrivateKey:     00f0a456731a7957436129eabee377943e56e3e94ac8f9024871410a68dd8034
keypairPublicKey:      11547c08ba0b6b6a58ad7da7635a891f405b06a05989bd89ae86e01c15421476
blinding:              00459b69566d3e3beccbfff06277e17a8e2e6a9a63c045123b11261413b3a1bb
commitment:            0fbf6ff76808417ed9aa838888b136677a0c94b3edd150ab3c9464ae423f9c13
original_recipient_vk: As56rPBCbq1dGVZV3z11mCA8uNzQ5NbCDH8ytBoEpNJm  (the PDA, can't be used)
token_mint:            So11111111111111111111111111111111111111112  (SOL)
proposal:              #18 on multisig 5hrqqkcaf7Xsx2gR7mFouBSXSGS1jtK1EGwV6NVnHpG2
```

Recovery is non-trivial — needs operator key + Cloak SDK + a proof. Can be deferred until the user wants the 0.1 SOL devnet back, or written as a one-off recovery script later.

---

## 📋 Next steps

### Round 1 — bugs + Privacy meter calibration (DONE)

- **R1.1** ✅ BUG-1 `* 1000` fix.
- **R1.2** Skipped — meter is informational; will recalibrate when mainnet pool ramps up.
- **R1.3** ✅ "Updated X min ago" relative time (`relativeTime()` helper, auto-updates as data ages).

### Round 2 — Spending Limits truth source (DONE)

- **R2.1** ✅ API decorates with `onChainExists`.
- **R2.2** ✅ SendModal filters out non-existent limits.
- **R2.3** ✅ Limits page shows "Pending approval" badge.

### Round 3 — manual user-flow validation (needs wallet — list above)

- User performs the 16 manual steps and reports back what works and what doesn't.

### Round 4 — feature completeness (future)

- API routes that don't persist `vaultIndex`: `/api/proposals`, `/api/swaps`, `/api/payrolls` (front-end has the value, just not threaded into Zod schema).
- SwapModal, Payroll page, Invoice page: all hardcode `index: 0`. Same fix pattern as SendModal.
- Proposal list/detail: read `VaultTransaction.vaultIndex` from chain, show "From: Treasury" badge.

---

## 🗂️ Test artifacts

- Screenshots: `docs/validation-shots/*.png` (auth-wall captures, 5 routes)
- This log: `docs/VALIDATION_LOG_ACCOUNTS.md`
- Validation script: `scripts/validate-accounts-flow.mjs`

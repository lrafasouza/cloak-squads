# Cloak Real Integration — Migration Analysis

**Date:** 2026-04-27
**Context:** Hackathon Cloak Track, deadline 2026-05-14
**Goal:** Replace cloak-mock with real Cloak devnet program

---

## Executive Summary

**The standalone deposit workaround works.** The `transact()` function from the SDK correctly uses discriminator 0 with the right 7-account layout and generates valid Groth16 proofs. This was confirmed by code analysis AND a live devnet test (tx `YMeL2tGFxfUDjRngT2okWfXKzxuexNTXy6WzRyKbg6g6repS3So1n11nvB1M74mjfGQzjbe6Mejj3GHxn9XKTNr`).

**Commitment scheme migration is REQUIRED.** The app currently uses the legacy `computeCommitment(amount, r, sk_spend)` scheme. The real Cloak program uses the UTXO scheme `computeUtxoCommitment({ amount, keypair, blinding, mintAddress })`. They produce different values for the same inputs. The pre-computed commitment MATCHES the on-chain commitment — deterministic round-trip confirmed.

**The relay IS needed (not relay-free).** The on-chain program has `riskCheckEnabled = true` hardcoded (SDK line 6299). Deposits require a signed Ed25519 sanctions/risk quote from the relay's Range Oracle integration. Without it, the program rejects with `0x10b3`. The relay provides this via `${relayUrl}/range-quote`.

**Recommended path:** Use `transact()` directly for the Cloak deposit, keep the gatekeeper as authorization layer (Squads governance → license → operator trigger). Migrate commitment scheme from legacy to UTXO.

---

## Part 1: The Workaround — `transact()` Deposit

### What the team Cloak sent

The snippet calls `transact()` instead of `sdk.deposit()`. This works because `transact()` uses `buildTransactInstruction` internally which emits discriminator 0 (the live path on devnet).

### Verification: every function exists and is exported

| Function | Exported | Bundle line | Purpose |
|---|---|---|---|
| `transact` | YES | 6834, exported at 474 | Unified deposit/transfer/withdraw |
| `createUtxo` | YES | 107, exported at 42 | Build output UTXO with random blinding |
| `createZeroUtxo` | YES | 118, exported at 43 | Build zero-padding UTXO |
| `generateUtxoKeypair` | YES | 79, exported at 47 | Generate spend keypair for UTXO |
| `CLOAK_PROGRAM_ID` | YES | 3174 | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| `NATIVE_SOL_MINT` | YES | exported | `SystemProgram.programId` |

### The internal call chain (verified line-by-line)

```
transact()                              [6834]
  ├─ validates inputUtxos/outputUtxos   [6875-6879] max 2 each
  ├─ pads to 2 inputs + 2 outputs       [6883-6894] with zeroUtxos
  ├─ validates balance: in + external === out  [6897]
  ├─ enforces MIN_DEPOSIT_LAMPORTS      [6900-6906] ≥ 0.01 SOL
  ├─ derives PDAs                       [6917] getShieldPoolPDAs(programId, mint)
  ├─ builds Merkle proofs               [6917-7191] from relay or on-chain
  ├─ computes commitments/nullifiers    [7192-7279]
  ├─ generatesTransactionProof()        [7347] — Groth16 via snarkjs
  │   └─ fetches circuit .wasm+.zkey from S3  [6020-6031]
  │   └─ snarkjs.groth16.fullProve()    [internal]
  ├─ proofToBytesLocal()                [7381] — 256 bytes
  ├─ buildPublicInputsBytesFromSignals() [7382] — 264 bytes (9 signals)
  ├─ buildTransactInstruction()         [6362]
  │   └─ discriminator = 0             [6102] ✅ correct
  │   └─ 7 accounts: payer, pool, treasury, merkleTree, nullifier0, nullifier1, systemProgram  [6134-6148]
  │   └─ data: disc[1] + proofBytes + publicInputsBytes + [encryptedNote envelope]  [6120-6132]
  └─ submits via submitTransactionDirect()  [7421-7472] or relay  [7529-7707]
```

### Important details about the workaround snippet

1. **`externalAmount` must be positive for deposits.** The workaround passes `amount` (bigint) as `externalAmount`. This is correct — positive = deposit, negative = withdraw.

2. **`transact()` requires `depositorKeypair` for signing.** The workaround passes `payer` as `depositorKeypair`. This is correct for Node.js/server-side use.

3. **The workaround serializes output secrets manually.** It extracts `spendKeyHex` and `blindingHex` from the keypair/UTXO. But `TransactResult.outputUtxos[0]` already contains everything — the manual serialization is redundant but not wrong.

4. **Minimum deposit is 0.01 SOL (10M lamports).** Enforced at `index.cjs:6902`.

5. **Circuit files are fetched from S3** on first call: `https://cloak-circuits.s3.us-east-1.amazonaws.com/circuits/0.1.0/withdraw_regular_*` and `transaction_*`. ~20MB download, then cached.

6. **Proof generation takes 5-30 seconds** depending on hardware (Groth16 fullProve).

7. **The relay at `https://api.devnet.cloak.ag` is used for:**
   - Merkle tree state
   - Range/risk quotes (Switchboard oracle)
   - Viewing key registration
   - Encrypted note submission

### Verdict: The workaround WILL WORK for standalone deposits.

---

## Part 2: Gatekeeper CPI — Can We CPI Into Real Cloak?

### Current architecture (mock)

```
Operator → execute_with_license() → CPI → cloak-mock::stub_transact()
```

**mock `stub_transact` accepts:**
- Data: anchor_discriminator("global:stub_transact") + nullifier[32] + commitment[32] + amount[8] + recipientVkPub[32] + proofBytes[256] + merkleRoot[32]
- Accounts (4): pool, nullifier_record, operator/signer, system_program

**Real Cloak `transact` instruction expects:**
- Data: disc[0] + proofBytes[256] + publicInputsBytes[264] + [encryptedNote envelope]
- Accounts (7+): payer/signer, pool, treasury, merkleTree, nullifierPDA0, nullifierPDA1, system_program, [optional: recipient, riskCheck sysvar, SPL accounts]

### The fundamental problem

**Proof generation is tightly coupled with submission inside `transact()`.**

The proof is generated at line 7347 and submitted at lines 7383+. They're in the same retry loop. There is NO option to generate proof only and return it.

**Two different proof formats exist:**

| | Exported (`generateWithdrawRegularProof`) | Internal (`generateTransactionProof`) |
|---|---|---|
| Circuit | `withdraw_regular` | `transaction` |
| Proof bytes | `proofToBytes` (line 691) | `proofToBytesLocal` (line 6032) |
| Public inputs | `buildPublicInputsBytes` → 104 bytes | `buildPublicInputsBytesFromSignals` → 264 bytes |
| Format | pi_a/pi_b/pi_c with specific endian swap | DIFFERENT endian swap (c0/c1 swapped in pi_b) |
| Exported? | YES | NO |
| What devnet program expects? | Unknown — likely `transaction` circuit | What `transact()` uses |

**`buildTransactInstruction` is NOT exported.** You cannot import it to build the instruction yourself after generating a proof separately.

### What would need to change for gatekeeper CPI into real Cloak

#### Rust side (`execute_with_license.rs`)

1. **Account list:** 4 → 7+ accounts. Need to pass treasury, merkleTree, and two nullifier PDAs through the `ExecuteWithLicense` struct.

2. **CPI data format:** Change from anchor discriminator + field serialization to disc[0] + proof[256] + publicInputs[264].

3. **Nullifier PDA derivation:** Real Cloak derives nullifiers as `["nullifier", pool, nullifierBytes]`. The mock uses `["nullifier", nullifierBytes]`. The gatekeeper would need to derive these correctly.

4. **The proof must be real.** No more dummy `Uint8Array(256).fill(0)`. The operator must generate a valid Groth16 proof client-side and pass it through.

#### TypeScript/Client side

1. **Proof generation:** Need to either:
   - (a) Use `generateWithdrawRegularProof` (exported, but potentially wrong circuit)
   - (b) Monkey-patch the SDK to export `generateTransactionProof` and `proofToBytesLocal`
   - (c) Re-implement proof generation using snarkjs directly (circuit files are on S3)

2. **Instruction building:** Need to re-implement `buildTransactInstruction` in TypeScript (not hard, but need to match the exact format).

3. **Merkle tree data:** For deposits (0 inputs), Merkle proofs aren't needed for inputs, but the root is needed for the public inputs. This can be fetched from relay or on-chain.

### Risk assessment for gatekeeper CPI approach

| Risk | Severity | Notes |
|---|---|---|
| Wrong circuit type | HIGH | If devnet expects `transaction` circuit, `withdraw_regular` proofs will be rejected |
| Proof byte format mismatch | HIGH | The two `proofToBytes` variants have different endian handling |
| Public inputs size mismatch | HIGH | 104 bytes vs 264 bytes — different format entirely |
| Account derivation mismatch | MEDIUM | Nullifier PDAs have different seeds in real vs mock |
| Compute budget | MEDIUM | Real Groth16 verification on-chain consumes significant CU |
| Tight timeline | HIGH | All of the above must be debugged on devnet with real SOL |

---

## Part 3: Recommended Architecture for the Hackathon

### The practical path: separate the Cloak transaction from the gatekeeper CPI

```
Phase 1: Squads Governance (unchanged)
  Multisig member → propose issue_license → vote → vault executes → license on-chain

Phase 2: Operator Execution (changed)
  Operator reads license → generates proof → calls transact() directly → marks license consumed

Phase 3: License Consumption (new)
  Operator calls execute_with_license (CPI into mock OR no-CPI variant)
```

**What changes:**

1. **The Cloak deposit happens via `transact()` directly** — the operator calls the SDK function, which submits a transaction to the real Cloak devnet program. This is a standalone Solana transaction, not a CPI through the gatekeeper.

2. **The gatekeeper still enforces authorization** — the license must exist and be active. But instead of CPIing into Cloak, it just marks the license as consumed.

3. **Two options for the gatekeeper:**

   **Option A (minimal Rust change):** Keep the mock CPI but use real Cloak separately.
   - Operator calls `transact()` to deposit into real Cloak (separate tx)
   - Operator calls `execute_with_license` which CPIs into mock (existing flow, unchanged)
   - The mock CPI is just a bookkeeping step; the real Cloak transaction already happened
   - Rust: no changes needed

   **Option B (cleaner, more Rust changes):** Remove the CPI, just consume the license.
   - Operator calls `transact()` to deposit into real Cloak (separate tx)
   - Operator calls `execute_with_license` which just marks license as Consumed (no CPI)
   - Rust: remove the `invoke()` call, just set `license.status = Consumed`

   **Option C (full real integration, highest effort):** Gatekeeper CPIs into real Cloak.
   - Operator generates proof client-side (need to solve the circuit/format problem)
   - Operator passes proof to `execute_with_license`
   - Gatekeeper builds `transact` ix and CPIs into real Cloak
   - Rust: major rewrite of accounts + CPI data format

### What I recommend: Option A for the hackathon

- Zero Rust changes needed
- The Cloak deposit uses real devnet infrastructure (proven `transact()` workaround)
- The mock CPI is just a ceremony — the real privacy is in the Cloak transaction
- Demo shows: Squads governance → license → operator triggers real Cloak deposit → license consumed

---

## Part 4: Files That Need Changes (Option A)

### TypeScript changes

| File | Change |
|---|---|
| `apps/web/lib/init-commitment.ts` | Already uses `@cloak.dev/sdk-devnet` — no change needed |
| `apps/web/lib/gatekeeper-instructions.ts` | Add `transact()` import, create helper that wraps the workaround |
| `apps/web/app/cofre/[multisig]/operator/page.tsx` | Wire operator "execute" button to call `transact()` before `execute_with_license` |
| `apps/web/app/cofre/[multisig]/send/page.tsx` | Update send flow to use `transact()` for the actual Cloak deposit |
| `scripts/f1-e2e-devnet.ts` | Replace mock pool init + mock execute with `transact()` deposit + real Cloak PDAs |
| New: `packages/core/src/cloak-deposit.ts` | The workaround snippet as a proper module |
| `apps/web/lib/env.ts` | Keep `NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID` for gatekeeper CPI (unchanged) |

### Rust changes: NONE (Option A)

### What stays the same

- `programs/cloak-mock/` — stays deployed, gatekeeper still CPIs into it
- `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs` — unchanged
- `packages/core/src/commitment.ts` — unchanged (uses `computeCommitment` for hashing, not deposit)
- `packages/core/src/gatekeeper-client.ts` — unchanged
- `packages/core/src/pda.ts` — unchanged
- All integration tests — unchanged (they test the gatekeeper CPI shape with mock)
- Squads multisig/proposal/vote/execute flow — unchanged

---

## Part 5: Questions for the Cloak Team

Before implementing, clarify with them:

1. **Which circuit does the devnet program expect?** Is it `transaction` (what `transact()` uses internally) or `withdraw_regular` (what `generateWithdrawRegularProof` generates)? This determines whether the gatekeeper CPI approach is viable.

2. **Is there a way to generate a proof without submitting?** Even an internal/undocumented API. This would unlock the CPI approach.

3. **What is the exact public inputs layout for the `transact` instruction?** We know it's 264 bytes (9 signals) from the internal code, but the Cloak team should confirm.

4. **Is the devnet relay stable?** The `transact()` function depends on the relay for Merkle tree state, risk quotes, and viewing key registration. Any downtime blocks deposits.

---

## Appendix A: `transact()` Deposit Flow (Step by Step)

```
1. generateUtxoKeypair() → { privateKey: bigint, publicKey: bigint }
2. createUtxo(amount, keypair, NATIVE_SOL_MINT) → { amount, keypair, blinding, mintAddress, commitment }
3. createZeroUtxo(NATIVE_SOL_MINT) × 3 → zero-padded inputs/outputs
4. transact({
     inputUtxos: [zeroIn0, zeroIn1],
     outputUtxos: [outputUtxo, zeroOut],
     externalAmount: amount,  // positive = deposit
     depositor: payer.publicKey,
   }, {
     connection,
     programId: CLOAK_PROGRAM_ID,
     relayUrl: "https://api.devnet.cloak.ag",
     depositorKeypair: payer,
   })
   → TransactResult {
       signature,              // on-chain tx signature
       commitmentIndices,      // [leafIndex, siblingIndex] in merkle tree
       outputCommitments,      // [commitment0, commitment1] as bigint
       outputUtxos,            // full UTXO objects with keypair + blinding + index
       newRoot,                // merkle root after insert
       siblingCommitments,     // for merkle proof computation
       merkleTree,             // cached tree for next tx
     }
```

## Appendix B: Cost Estimate for Real Devnet Deposit

- Deposit amount: 0.05 SOL (50M lamports)
- Protocol fee: 5M (fixed) + floor(50M × 3/1000) = 5M + 150K = 5.15M lamports
- Solana base fee: ~5K lamports
- Priority fee: ~10K microLamports × CU
- Total: ~0.055 SOL per deposit

## Appendix C: Key SDK Exports for the Migration

```typescript
// Deposit workaround
import {
  transact,
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  DEVNET_MOCK_USDC_MINT,
  getShieldPoolPDAs,
  type TransactParams,
  type TransactOptions,
  type TransactResult,
  type Utxo,
} from "@cloak.dev/sdk-devnet";

// Already used (unchanged)
import {
  computeCommitment,
  type NoteData,
} from "@cloak.dev/sdk-devnet";
```

---

## Appendix D: Live Devnet Probe Results (2026-04-27)

### Test: `pnpm probe:real-deposit`

**3/3 checks passed:**

```
Expected commitment (pre-compute): 2927d4441b8aa3754ef9a1e645bb373aad68318b0b3ff2760e78f49a908837bc
Recomputed commitment:            2927d4441b8aa3754ef9a1e645bb373aad68318b0b3ff2760e78f49a908837bc
Commitment match: ✅ YES

✅ tx signature: YMeL2tGFxfUDjRngT2okWfXKzxuexNTXy6WzRyKbg6g6repS3So1n11nvB1M74mjfGQzjbe6Mejj3GHxn9XKTNr
output commitments: [
  '2927d4441b8aa3754ef9a1e645bb373aad68318b0b3ff2760e78f49a908837bc',
  '16bd9974ee040732f1cbad615b436f115140b40cc885e2345a3a3c554a597d8a'
]
On-chain match pre-computed: ✅ YES
leaf indices: [ 222, 223 ]
```

### Corrected config (relay required for risk quote)

```typescript
await transact(
  { inputUtxos: [], outputUtxos: [outputUtxo, zero], externalAmount: amount, depositor: payer.publicKey },
  {
    connection,
    programId: CLOAK_PROGRAM_ID,
    relayUrl: "https://api.devnet.cloak.ag",   // REQUIRED — risk check is mandatory on devnet
    enforceViewingKeyRegistration: false,        // safe to skip for testing
    useChainRootForProof: true,                  // uses on-chain root, not relay merkle
    depositorKeypair: payer,
    onProgress: (s) => console.log(s),
    onProofProgress: (p) => console.log(`proof: ${p}%`),
  },
);
```

### Why relay-free failed

`riskCheckEnabled` is hardcoded `true` at SDK line 6299. The on-chain program requires an Ed25519-signed sanctions quote from Range Oracle at instruction index 0. Without the relay providing this via `${relayUrl}/range-quote`, the program rejects with `0x10b3` (4275). This is NOT configurable — it's a program-level enforcement.

### Cost of real deposit

- Deposit: 0.05 SOL
- Protocol fee deducted: ~0.00515 SOL (5M fixed + 150K variable)
- Priority fee: ~0.00001 SOL
- ALT creation (one-time): ~0.0015 SOL
- Total per deposit: ~0.055 SOL

### Commitment scheme migration — confirmed required

| | Legacy (current) | UTXO (required) |
|---|---|---|
| SDK export | `computeCommitment` (aliased from `computeCommitment$1`) | `computeUtxoCommitment` (aliased from `computeCommitment`) |
| Inputs | `(amount, r, sk_spend)` | `({ amount, keypair, blinding, mintAddress })` |
| Includes mint? | NO | YES |
| Deterministic? | YES | YES (verified) |
| Used by transact()? | NO | YES |

The `init-commitment.ts` currently uses `computeCommitment(legacy)`. Must migrate to `computeUtxoCommitment` with `deriveUtxoKeypairFromSpendKey`. Pre-computed commitments from the propose path will match on-chain commitments from the deposit path — verified end-to-end.

# Spike Findings

## 2026-04-24 Phase 0 — COMPLETE

### Toolchain

- Node `v24.12.0`, pnpm `9.12.0` via Corepack.
- Rust pinned to `1.86.0` via `rust-toolchain.toml`.
- Anchor CLI `0.31.1`, `anchor-lang 0.31.1`, Solana CLI `3.1.14 (Agave)`.
- `proc-macro2` pinned to `=1.0.94` in `Cargo.lock`.
- Deployer keypair: `QqibVKumHaJAC5bYii7q2QRWf3faYTEj8ff1d6gqST5` (devnet).

### Task 0.4 — CPI gatekeeper → cloak-mock — VERIFIED (bankrun)

`tests/integration/spike-cpi.test.ts` proves:
- Both SBF programs load; `execute_with_license` consumes license, CPIs into `cloak_mock::stub_transact`, which CPIs into System Program to init `NullifierRecord` — 3 levels deep.
- License status transitions `Active → Consumed`.
- `StubPool.tx_count` increments; `NullifierRecord` is created with nullifier bytes.
- Gatekeeper consumes ~20k CU out of 200k — ample headroom for real Cloak program.

Run: `pnpm test:int`.

### Task 0.5 — Squads v4 vault_transaction → gatekeeper — VERIFIED (devnet)

`scripts/spike-squads-devnet.ts` proves on devnet that the Squads v4 vault PDA propagates as inner signer into `cloak-gatekeeper::init_cofre`.

Deployed gatekeeper: `WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J`
Deploy tx: `3Uu2QVVhk1fZqZqhHHeCKHUkBX4XBvpMb6nbp98h72a4kMHfehwu6eqc68qQAQa21kXr7Fp2Wr3iNQZz8CTMdzWD`

Spike run 2026-04-24:
- multisig PDA: `12JqcHUtNGMG4AammpcCVDp7rZEdyGKNTMHKArPZi7d9`
- vault PDA: `7ug26u13tEnU1VkuRuVUNVbUtGGm7SqsojCY483aXPnR`
- cofre PDA: `8Fa5SamHwC4D4csUvZZjCZ9dHFTSZEcZfyPRoRiEkPaK`
- vaultTransactionExecute tx: `56ve6esPWKJ1cLufzmKQoPHv266Uck8pNY5htQfkfC6ZcU5mLFohrBSV5oymzzPPhX6sw73jaPssRqEvBtDbKjzB`
- Explorer: https://explorer.solana.com/tx/56ve6esPWKJ1cLufzmKQoPHv266Uck8pNY5htQfkfC6ZcU5mLFohrBSV5oymzzPPhX6sw73jaPssRqEvBtDbKjzB?cluster=devnet

On-chain assertions post-execute:
- `Cofre.multisig == multisigPda` ✅
- `Cofre.operator == operator.publicKey` ✅

If the vault PDA had not propagated, `verify_squads_vault_signer` would have returned `InvalidSquadsSigner` and the execute tx would have failed. It succeeded and wrote the expected state — proof accepted.

Run: `SOLANA_KEYPAIR=~/.config/solana/cloak-devnet.json pnpm spike:devnet`.

### Phase 0 checkpoint #5 — Cloak SDK exports — VERIFIED (static)

`@cloak.dev/sdk@0.1.5` installed and pinned in `package.json` (`^0.1.5`).

Source-of-truth for exports is the package's `dist/index.d.ts`, NOT the public docs at docs.cloak.ag (which were incomplete on 2026-04-24).

All planned imports confirmed present:

| Plan calls | Real export |
|---|---|
| `generateCloakKeys` | ✅ exported |
| `computeCommitment` | ✅ exported (also `computeUtxoCommitment` alias) |
| `computeNullifier` | ✅ exported (also `computeUtxoNullifier` alias) |
| `deriveDiversifiedViewingKey` | ✅ exported |
| `deriveDiversifier` | ✅ exported |
| `scanTransactions` | ✅ exported |
| `scanNotesForWallet` | ✅ exported |
| `toComplianceReport` | ✅ exported |
| `formatComplianceCsv` | ✅ exported |
| `transact`, `transfer`, `fullWithdraw`, `partialWithdraw` | ✅ exported |
| `CloakSDK` class with `.deposit/.withdraw/.send/.privateTransfer/.swap` | ✅ exported |
| `encryptNoteForRecipient`, `tryDecryptNote` | ✅ exported |
| `encryptTransactionMetadata`, `decryptTransactionMetadata` | ✅ exported |
| `deriveUserCompliancePublicKey`, `decryptComplianceMetadataWithMasterKey` | ✅ exported |

Plan crypto wrappers in `@cloak-squads/core` (Task 1.3) can be written against this surface without redesign.

### Cloak SDK end-to-end spike — BLOCKED on devnet

Cloak program `zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW` is **mainnet-only** (verified 2026-04-24: `solana account ... --url devnet` returns AccountNotFound; same query on mainnet-beta returns executable BPF program). The SDK's `network: "devnet"` parameter does not switch program IDs — it only switches RPC URL, so any `transact()` call from devnet hits the same hardcoded program ID and fails with "Attempt to load a program that does not exist".

`cloak-mock` is deployed on devnet at `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe`
and was verified on 2026-04-26. Earliest transaction currently returned by devnet history:
`3M3We9A7Fdg7RJcTb8QUfdoAvaSEKUfDdfRhtkVaeEXyUuE4sCB9sk6BoQZHaDG54nFbhBM4EjgPpEhv9qC4pXZp`.

Implications:
- Our `cloak-gatekeeper` program runs on devnet with `cloak-mock` standing in for the real Cloak. The CPI shape is validated by `tests/integration/spike-cpi.test.ts` (bankrun).
- Real Cloak end-to-end can only be validated against mainnet. Cost for a smoke test (`deposit 0.01 SOL` + `withdraw`): ~0.015 SOL real (~$2-3).
- Option to defer real e2e until just before mainnet cut. Static type-level verification stands as Phase 0 evidence.

Spike script `scripts/spike-cloak-devnet.ts` is functional but will only succeed against mainnet. To run against mainnet:
```
SOLANA_KEYPAIR=~/.config/solana/mainnet.json \
  RPC_URL=https://api.mainnet-beta.solana.com \
  pnpm spike:cloak
```
(The script currently hard-codes devnet RPC; needs an env-driven RPC URL before mainnet run.)

### Phase 0 checkpoint (plan line 183)

- [x] Does CPI depth fit?
- [x] Does Squads v4 vault_transaction reach our gatekeeper with vault PDA as signer?
- [x] Does license+execute 2-tx pattern work end-to-end?
- [x] `@sqds/multisig` stable and pinned? (`2.1.4`)
- [x] Cloak SDK exports verified — static check via `dist/index.d.ts`. Runtime e2e is mainnet-only; deferred until pre-mainnet smoke test.

### Known tech debt

- `CLOAK_MOCK_PROGRAM_ID` hard-coded in `execute_with_license.rs`. Make configurable before mainnet cut.
- Both program crates: drop direct `solana-program` dep, use `anchor_lang::solana_program`. Cosmetic.
- `anchor-bankrun 0.5.0` peer-deps `@coral-xyz/anchor ^0.30.0`; we use `0.31.1`. Working in practice.

### Balances

After Squads spike (~5.22 SOL remaining). Cloak spike will consume an additional ~0.06 SOL (deposit fee + variable + relay).

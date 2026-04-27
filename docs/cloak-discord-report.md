# Cloak Devnet SDK Bug — Discord Report

**Audience:** Cloak core team / `cloak.ag/discord`
**Reporter:** `cloak-squads` hackathon team (Cloak Track, deadline 2026-05-14)
**Date:** 2026-04-26
**Repo:** internal — full diagnosis in `docs/devnet-blocker.md`, repro scripts under `scripts/`

---

## TL;DR

`@cloak.dev/sdk-devnet@0.1.5-devnet.0` ships a broken `sdk.deposit()`. It builds the legacy 4-account instruction with discriminator `1`, which the deployed devnet program (`Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`) no longer accepts.

Every public deposit-flow entry point (`deposit`, `privateTransfer`, `withdraw`) hits the same dead code path because they all call `CloakSDK.deposit()` internally. The unified `transact` instruction (discriminator `0`) is accepted but requires constructing UTXOs + a real Groth16 proof manually — not exposed by any high-level API.

Net effect: **devnet end-to-end is impossible via the published SDK API today**.

---

## Environment

| | |
|---|---|
| SDK | `@cloak.dev/sdk-devnet@0.1.5-devnet.0` |
| Cloak program | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| Relay | `https://api.devnet.cloak.ag` |
| RPC | `https://api.devnet.solana.com` |
| Test wallet | `QqibVKumHaJAC5bYii7q2QRWf3faYTEj8ff1d6gqST5` (devnet) |
| `@solana/web3.js` | `1.98.4` |
| Node | `v24.12.0` |
| pnpm | `9.12.0` |

---

## What we tried (and what happened)

### Attempt 1 — High-level `sdk.deposit(...)`

```ts
import { CloakSDK, MemoryStorageAdapter } from "@cloak.dev/sdk-devnet";
import { Connection, Keypair } from "@solana/web3.js";

const sdk = new CloakSDK({
  keypairBytes: keypair.secretKey,
  network: "devnet",
  storage: new MemoryStorageAdapter(),
  debug: true,
});

await sdk.deposit(connection, 50_000_000);
```

**Result:** `CloakError: Deposit failed: Simulation failed. custom program error: 0x1063`

Logs:
```
Program Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h invoke [1]
Program Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h consumed 112 of 39550 compute units
Program Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h failed: custom program error: 0x1063
```

`0x1063` = 4195 = `"Missing required accounts"` (per the SDK's own error map at `dist/index.cjs:1457`).

CU usage of just 112 indicates the program rejected before any real account validation — looks like instruction-tag dispatch failure rather than an actual missing account.

### Attempt 2 — `sdk.privateTransfer(...)`

```ts
const note = await generateNote(amount, "devnet");
await sdk.privateTransfer(
  connection,
  note,
  [{ recipient: owner, amount: amount - 100_000 }],
  { onProgress, onProofProgress },
);
```

**Result:** identical `0x1063`. Stack trace shows `CloakSDK.privateTransfer` calls `CloakSDK.deposit` first when the note isn't deposited yet — same failing code path.

### Attempt 3 — Manual deposit ix variations (discriminator `1`)

We hand-built the deposit instruction, varying account count:

| Variant | Accounts | CU consumed | Error |
|---|---|---|---|
| Legacy 4-account (matches `createDepositInstruction`) | payer, pool, system, merkleTree | 112 | 0x1063 |
| + treasury | 5 | 119 | 0x1063 |
| + vaultAuthority | 5 | 119 | 0x1063 |
| + treasury + vaultAuthority | 6 | 130 | 0x1063 |

All four variants fail with the same error at ~similar CU counts. **Discriminator `1` appears to be retired entirely**, regardless of account list — the program rejects at instruction dispatch.

### Attempt 4 — Manual `transact` ix (discriminator `0`)

```ts
const transactData = new Uint8Array(1 + 256 + 32); // discriminator + dummy proof + dummy public inputs
transactData[0] = 0;

const ix = new TransactionInstruction({
  programId: CLOAK_PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: merkleTree, isSigner: false, isWritable: true },
    { pubkey: nullifierPda0, isSigner: false, isWritable: true },
    { pubkey: nullifierPda1, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.from(transactData),
});
```

**Result:** `0x1062` (4194 = `"Invalid instruction data"`) at 140 CU.

This is the **good signal**: the program accepted the instruction tag, validated the account list, and rejected only because our 256-byte zero proof + 32-byte zero public inputs are invalid (expected — junk payload). Discriminator `0` (`transact`) is the live path on devnet.

---

## Diagnosis

The devnet program retired the legacy `deposit` ix (discriminator `1`) and now requires everything to flow through the unified `transact` ix (discriminator `0`). The SDK was not refactored to match: `CloakSDK.deposit()` still calls `createDepositInstruction()` (cjs line 2589) which emits discriminator `1` with 4 accounts.

Source pointers in the published SDK bundle:

| Reference | File:Line |
|---|---|
| Hardcoded program ID | `dist/index.cjs:3174` |
| Error map (4194/4195) | `dist/index.cjs:1456-1457` |
| Legacy deposit ix builder (broken) | `dist/index.cjs:2589` |
| Modern transact ix builder (works) | `dist/index.cjs:6109` |
| `sdk.deposit()` calling legacy builder | `dist/index.cjs:3325` |

---

## What we verified independently

- `Cloak program is executable`: `solana program show Zc1kHfp...` returns BPF executable, last deployed slot present.
- All shield-pool PDAs are initialized for both `NATIVE_SOL_MINT` and `DEVNET_MOCK_USDC_MINT`:
  - SOL pool: `2Ez6u27NsSkFDF4uGAhFCU4p13LVTQe69z5JvW6QViXd` (75B)
  - SOL merkle tree: `CmajEiFYFdMfUDoGmXx655Q4uvDZ7D3M14FfLTdN4M3J` (4312B)
  - SOL treasury: `DDzfuLaWWFRVZgF4J2WDmxp3kLuoqeEw2jPfonkqujDK` (0B)
  - SOL vaultAuthority: `5HJxte4tEvcEu5z1KKU599d1HvCU2uGJ7vM9esBPvUzC` (0B)
  - Mock USDC pool: `DbYib7QXdqowuhUDB4H6n2iLiSDXnHr13rjTv5CVB2NK` (75B)

So infrastructure is fine; the gap is purely client-side.

---

## Asks

In order of usefulness to us:

1. **Confirm the diagnosis** — is `transact` (disc `0`) indeed the only accepted entry point on devnet now? Is there any newer SDK build we should pull? Is there a roadmap/ETA for an SDK release that routes deposits through `transact`?
2. **If a fix isn't imminent**, can you publish a minimal example of constructing a valid `transact` deposit (2-out, no inputs, with the public-input layout the program currently expects)? We have the circuits available via `getDefaultCircuitsPath()` but not the public-input encoding for the deposit-only case.
3. **Privately point out anything we got wrong** in the analysis above before this gets shared more broadly — happy to update.

---

## What we're doing in the meantime

Falling back to a `cloak-mock` Anchor program we already had for tests. The `cloak-gatekeeper` ↔ inner-program CPI shape was validated in bankrun (`tests/integration/spike-cpi.test.ts`) and the mock is deployed on devnet at `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe`. Hackathon submission will demo Squads-gated execution end-to-end with the mock, swap to real Cloak after the SDK is fixed (or a manual `transact` integration is in place).

Repro scripts in our repo, can share publicly if useful:

- `scripts/spike-cloak-devnet.ts` — minimal `sdk.deposit` repro
- `scripts/probe-cloak-devnet-pdas.ts` — pool/merkle/treasury PDA inspector
- `scripts/probe-cloak-deposit-manual.ts` — variant matrix for manual ix construction (the source of the table above)

---

## Discord-ready short version

Paste this into `#dev-help` / `#bugs`:

> Hey! Building a Squads × Cloak integration for the Cloak Track hackathon. Hit a blocker in `@cloak.dev/sdk-devnet@0.1.5-devnet.0`:
>
> `sdk.deposit()` (and therefore `sdk.privateTransfer()` / `sdk.withdraw()` since they call deposit internally) builds the legacy 4-account instruction with discriminator `1`. The deployed devnet program (`Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`) rejects this with `0x1063` (4195 = "Missing required accounts") at ~112 CU.
>
> I tested manually: discriminator `0` (`transact`) is accepted by the program (gets to instruction-data validation, fails at `0x1062` = "Invalid instruction data" with junk payload — expected). So `transact` is the live path. Looks like `sdk.deposit()` needs to route through `transact` instead of `createDepositInstruction`.
>
> Repro:
> ```ts
> import { CloakSDK, MemoryStorageAdapter } from "@cloak.dev/sdk-devnet";
> const sdk = new CloakSDK({ keypairBytes, network: "devnet", storage: new MemoryStorageAdapter() });
> await sdk.deposit(connection, 50_000_000); // throws 0x1063
> ```
>
> Wallet: `QqibVKumHaJAC5bYii7q2QRWf3faYTEj8ff1d6gqST5` (devnet). All shield-pool PDAs (pool/merkleTree/treasury/vaultAuthority) for both `NATIVE_SOL_MINT` and `DEVNET_MOCK_USDC_MINT` are initialized — verified directly. Happy to share full tx logs and a probe script.
>
> Until this is fixed I'm staying on a mock program for the hackathon. Any ETA on a patched SDK, or should I roll a manual `transact` integration with circuits/proofs?

---

## Internal references

- `docs/devnet-blocker.md` — original deep dive
- `docs/spike-findings.md` — Phase 0 findings, includes 2026-04-26 update on the SDK breakage
- `scripts/spike-cloak-devnet.ts` — minimal repro
- `scripts/probe-cloak-devnet-pdas.ts` — PDA inspection
- `scripts/probe-cloak-deposit-manual.ts` — discriminator/account-list probe matrix

---

## Update log

- **2026-04-26** — initial report compiled. Discord post pending.
- **2026-04-27** — **RESOLVED** ✅. Cloak team endorsed the `transact()` workaround. Implemented `cloakDeposit()` wrapper using zero-input deposit pattern. See `packages/core/src/cloak-deposit.ts` and updated `docs/devnet-blocker.md`.

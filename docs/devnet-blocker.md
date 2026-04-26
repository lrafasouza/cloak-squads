# Cloak Devnet — SDK Blocker (2026-04-26)

## TL;DR

`@cloak.dev/sdk-devnet@0.1.5-devnet.0` ships a broken `sdk.deposit()` that
builds a legacy 4-account instruction with discriminator `1`, which the
deployed devnet program rejects. All public deposit paths in the SDK fail.
We continue building on `cloak-mock` until the SDK is fixed; gatekeeper CPI
shape is unaffected.

## Findings

Deployed Cloak program on devnet: `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`

All 4 shield-pool PDAs for both `NATIVE_SOL_MINT` and `DEVNET_MOCK_USDC_MINT`
are initialized on devnet (verified via `pnpm probe:cloak`).

### Behavior of each SDK entry point

| API | Discriminator built | Result |
|---|---|---|
| `sdk.deposit()` | `1` (legacy, 4 accounts) | `0x1063` (4195 = Missing required accounts) at ~112 CU |
| `sdk.privateTransfer()` | calls `sdk.deposit()` first | same as above |
| `sdk.withdraw()` (with non-deposited note) | calls `sdk.deposit()` first | same as above |
| Manual disc `1` with treasury / vault auth added | `1`, 5–6 accounts | same `0x1063` at ~120-130 CU (legacy ix is gone, no account list saves it) |
| Manual disc `0` (transact) with junk proof | `0`, 7 accounts | `0x1062` (4194 = Invalid instruction data) at ~140 CU — **program accepted the ix shape**, rejected on payload |

`buildTransactInstruction` (line 6109 of the bundled cjs) uses 7 accounts
including `treasury` and 2 nullifier PDAs. `createDepositInstruction`
(line 2589) only uses 4. `sdk.deposit()` calls `createDepositInstruction`
unconditionally.

### Conclusion

Discriminator `0` (`transact`) is the live deposit path on devnet. The SDK's
high-level deposit methods need to route through `transact` instead of the
legacy `createDepositInstruction`. Until that lands, devnet end-to-end via
the public SDK API is impossible.

## Repro

```ts
import { CloakSDK, MemoryStorageAdapter } from "@cloak.dev/sdk-devnet";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const sdk = new CloakSDK({
  keypairBytes: keypair.secretKey,
  network: "devnet",
  storage: new MemoryStorageAdapter(),
});
await sdk.deposit(connection, 50_000_000); // throws CloakError with 0x1063
```

In this repo:

```bash
pnpm probe:cloak           # confirms PDAs are initialized
pnpm spike:cloak           # hits the bug
pnpm probe:deposit         # discriminator/account-list probe (4194 vs 4195)
```

## Workaround

Continue using `cloak-mock` (`2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe`)
on devnet. The `cloak-gatekeeper` CPI shape is independent of the deposit
instruction; the integration point we cared about (Squads vault PDA → CPI →
inner program) was already validated in bankrun.

When the SDK is fixed (or we decide to integrate `transact()` standalone
manually), swap `CLOAK_MOCK_PROGRAM_ID` for the real Cloak program ID and
update the gatekeeper's CPI to use the unified `transact` instruction.

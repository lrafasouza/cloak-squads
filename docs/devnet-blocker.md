# Cloak Devnet — SDK Blocker (RESOLVED)

## Status: RESOLVED ✅

**Date:** 2026-04-27

The SDK blocker has been resolved by calling `transact()` directly with zero inputs (pure deposit pattern), as endorsed by the Cloak team. The `cloakDeposit()` wrapper in `packages/core/src/cloak-deposit.ts` implements this workaround.

## Original Issue

`@cloak.dev/sdk-devnet@0.1.5-devnet.0` shipped a broken `sdk.deposit()` that built a legacy 4-account instruction with discriminator `1`, which the deployed devnet program rejected with error `0x1063` (4195 = Missing required accounts).

## Solution

Use `transact()` directly instead of `sdk.deposit()`:

```typescript
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  transact,
} from "@cloak.dev/sdk-devnet";

const outputKeypair = await generateUtxoKeypair();
const outputUtxo = await createUtxo(amount, outputKeypair, mint);
const zeroIn0 = await createZeroUtxo(mint);
const zeroIn1 = await createZeroUtxo(mint);
const zeroOut = await createZeroUtxo(mint);

const result = await transact(
  {
    inputUtxos: [zeroIn0, zeroIn1],
    outputUtxos: [outputUtxo, zeroOut],
    externalAmount: amount,
    depositor: payer.publicKey,
  },
  {
    connection,
    programId: CLOAK_PROGRAM_ID,
    relayUrl: "https://api.devnet.cloak.ag",
    depositorKeypair: payer,
  },
);
```

This pattern (discriminator `0`, 7 accounts including treasury and nullifier PDAs) is the live deposit path on devnet.

## Implementation

See `packages/core/src/cloak-deposit.ts` for the full implementation used in production.

## Migration

The app now uses real Cloak deposits on devnet:
- `apps/web/app/cofre/[multisig]/operator/page.tsx` — calls `cloakDepositBrowser()` before `execute_with_license`
- `apps/web/app/claim/[stealthId]/page.tsx` — calls `fullWithdraw()` for real claims

No more `cloak-mock` for deposits/withdrawals — real funds flow through the Cloak shield pool.

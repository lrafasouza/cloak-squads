import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, test } from "vitest";
import { buildSpendingLimitUseIx } from "@/lib/spending-limits";

// `spending-limits.ts` is a thin builder over `@sqds/multisig`. The async
// proposal-creation paths require a live Connection + Wallet and are
// exercised end-to-end in integration tests against devnet. The only piece
// of pure logic this module owns is `buildSpendingLimitUseIx`:
//
//   1. it guards `amount > Number.MAX_SAFE_INTEGER` (bigint→Number is lossy
//      past 2^53 − 1; silent precision loss here would let a member drain
//      more lamports than the spending-limit policy allows);
//   2. it conditionally passes `mint` and `memo` so the SOL path doesn't
//      send a bogus `mint` field to the SDK.
//
// Everything else is structural delegation to the multisig SDK.

function args(overrides: Partial<Parameters<typeof buildSpendingLimitUseIx>[0]> = {}) {
  return {
    multisigPda: Keypair.generate().publicKey,
    member: Keypair.generate().publicKey,
    spendingLimitPda: Keypair.generate().publicKey,
    vaultIndex: 0,
    destination: Keypair.generate().publicKey,
    amount: BigInt(1_000_000),
    decimals: 9,
    ...overrides,
  };
}

describe("buildSpendingLimitUseIx", () => {
  test("returns a TransactionInstruction for a valid SOL transfer", () => {
    const ix = buildSpendingLimitUseIx(args());
    expect(ix).toBeDefined();
    expect(ix.programId).toBeInstanceOf(PublicKey);
    expect(Array.isArray(ix.keys)).toBe(true);
    expect(ix.keys.length).toBeGreaterThan(0);
    expect(ix.data).toBeInstanceOf(Buffer);
  });

  test("throws when amount exceeds Number.MAX_SAFE_INTEGER", () => {
    const tooBig = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => buildSpendingLimitUseIx(args({ amount: tooBig }))).toThrow(
      /exceeds Number\.MAX_SAFE_INTEGER/,
    );
  });

  test("accepts amount exactly at Number.MAX_SAFE_INTEGER", () => {
    const atMax = BigInt(Number.MAX_SAFE_INTEGER);
    expect(() => buildSpendingLimitUseIx(args({ amount: atMax }))).not.toThrow();
  });

  test("accepts zero amount (SDK validates downstream)", () => {
    expect(() => buildSpendingLimitUseIx(args({ amount: 0n }))).not.toThrow();
  });

  test("SOL path (no mint) produces a different ix layout from SPL path (with mint)", () => {
    const mint = Keypair.generate().publicKey;
    const solIx = buildSpendingLimitUseIx(args());
    const splIx = buildSpendingLimitUseIx(args({ mint }));

    // The SDK keeps the same number of account metas in both flows but swaps
    // a default-pubkey slot for the real mint on the SPL path. Either the
    // mint is wired into the account list, or the instruction data carries
    // a different discriminator — in both cases an external observable must
    // change. A stable check is "the SPL ix references the mint pubkey;
    // the SOL ix does not."
    const splReferencesMint = splIx.keys.some((k) => k.pubkey.equals(mint));
    const solReferencesMint = solIx.keys.some((k) => k.pubkey.equals(mint));
    expect(splReferencesMint).toBe(true);
    expect(solReferencesMint).toBe(false);
  });

  test("memo passthrough does not change account-key layout", () => {
    const withoutMemo = buildSpendingLimitUseIx(args());
    const withMemo = buildSpendingLimitUseIx(args({ memo: "payroll-may" }));

    expect(withMemo.keys.length).toBe(withoutMemo.keys.length);
    // Data buffer changes because the memo is serialized into the instruction.
    expect(withMemo.data.equals(withoutMemo.data)).toBe(false);
  });

  test("instruction binds the supplied destination pubkey", () => {
    const dest = Keypair.generate().publicKey;
    const ix = buildSpendingLimitUseIx(args({ destination: dest }));
    const destKeys = ix.keys.filter((k) => k.pubkey.equals(dest));
    expect(destKeys.length).toBeGreaterThan(0);
  });

  test("instruction binds the supplied member pubkey as a signer", () => {
    const member = Keypair.generate().publicKey;
    const ix = buildSpendingLimitUseIx(args({ member }));
    const memberMeta = ix.keys.find((k) => k.pubkey.equals(member));
    expect(memberMeta).toBeDefined();
    expect(memberMeta?.isSigner).toBe(true);
  });

  test("instruction binds the supplied spendingLimit PDA", () => {
    const limitPda = Keypair.generate().publicKey;
    const ix = buildSpendingLimitUseIx(args({ spendingLimitPda: limitPda }));
    const found = ix.keys.find((k) => k.pubkey.equals(limitPda));
    expect(found).toBeDefined();
  });

  test("vaultIndex does not crash for 0..127 (u8 range)", () => {
    for (const vaultIndex of [0, 1, 7, 127]) {
      expect(() => buildSpendingLimitUseIx(args({ vaultIndex }))).not.toThrow();
    }
  });
});

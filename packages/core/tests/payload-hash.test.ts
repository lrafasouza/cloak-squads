import { Keypair } from "@solana/web3.js";
import { describe, expect, test } from "vitest";
import { computePayloadHash } from "../src/hashing";
import type { PayloadInvariants } from "../src/types";

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

function randomInvariants(overrides: Partial<PayloadInvariants> = {}): PayloadInvariants {
  return {
    nullifier: randomBytes(32),
    commitment: randomBytes(32),
    amount: BigInt(1_000_000),
    tokenMint: Keypair.generate().publicKey.toBytes(),
    recipientVkPub: randomBytes(32),
    nonce: randomBytes(16),
    ...overrides,
  };
}

describe("payload-hash collision and determinism", () => {
  test("computePayloadHash returns a 32-byte digest", () => {
    const hash = computePayloadHash(randomInvariants());
    expect(hash).toHaveLength(32);
  });

  test("determinism: identical invariants produce identical hashes", () => {
    const inv = randomInvariants();
    const a = computePayloadHash(inv);
    const b = computePayloadHash(inv);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  test("avalanche: flipping one bit of the nullifier changes the hash", () => {
    const base = randomInvariants();
    const mutated: PayloadInvariants = {
      ...base,
      nullifier: new Uint8Array(base.nullifier),
    };
    mutated.nullifier[0] = mutated.nullifier[0] ^ 0x01;

    const a = computePayloadHash(base);
    const b = computePayloadHash(mutated);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  test("avalanche: flipping one bit of the nonce changes the hash", () => {
    const base = randomInvariants();
    const mutated: PayloadInvariants = {
      ...base,
      nonce: new Uint8Array(base.nonce),
    };
    mutated.nonce[0] = mutated.nonce[0] ^ 0x01;

    expect(Array.from(computePayloadHash(base))).not.toEqual(
      Array.from(computePayloadHash(mutated)),
    );
  });

  test("avalanche: changing the amount changes the hash", () => {
    const base = randomInvariants({ amount: BigInt(1_000_000) });
    const mutated = { ...base, amount: BigInt(1_000_001) };
    expect(Array.from(computePayloadHash(base))).not.toEqual(
      Array.from(computePayloadHash(mutated)),
    );
  });

  test("1000 random invariants produce 1000 distinct payload hashes (no collisions)", () => {
    const N = 1000;
    const seen = new Set<string>();

    for (let i = 0; i < N; i++) {
      const hash = computePayloadHash(randomInvariants());
      // Hex-encode for Set membership.
      const key = Buffer.from(hash).toString("hex");
      seen.add(key);
    }

    expect(seen.size).toBe(N);
  });

  test("1000 nonce-only variations (everything else fixed) produce 1000 distinct hashes", () => {
    // Stress-tests the path the License PDA actually relies on: nonce is the
    // last input mixed into the hash, and on devnet/mainnet the user code
    // controls only `nonce` + `nullifier` freshly per call. If the nonce is
    // 16 bytes (128-bit), birthday-bound collisions live around 2^64 trials —
    // 1000 trials should be deterministically collision-free.
    const N = 1000;
    const base = randomInvariants();
    const seen = new Set<string>();

    for (let i = 0; i < N; i++) {
      const inv: PayloadInvariants = { ...base, nonce: randomBytes(16) };
      const key = Buffer.from(computePayloadHash(inv)).toString("hex");
      seen.add(key);
    }

    expect(seen.size).toBe(N);
  });

  test("rejects nullifier with wrong length", () => {
    expect(() => computePayloadHash(randomInvariants({ nullifier: randomBytes(31) }))).toThrow(
      "nullifier must be 32 bytes",
    );
  });

  test("rejects commitment with wrong length", () => {
    expect(() => computePayloadHash(randomInvariants({ commitment: randomBytes(33) }))).toThrow(
      "commitment must be 32 bytes",
    );
  });

  test("rejects recipientVkPub with wrong length", () => {
    expect(() => computePayloadHash(randomInvariants({ recipientVkPub: randomBytes(16) }))).toThrow(
      "recipientVkPub must be 32 bytes",
    );
  });

  test("rejects nonce with wrong length", () => {
    expect(() => computePayloadHash(randomInvariants({ nonce: randomBytes(15) }))).toThrow(
      "nonce must be 16 bytes",
    );
  });
});

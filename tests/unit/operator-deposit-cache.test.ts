// Round-trip tests for the operator deposit cache. The runtime Utxo carries
// `bigint` fields and a `PublicKey` instance; both used to fail silently
// inside the cache write because `JSON.stringify` throws on BigInt and
// PublicKey collapses to an opaque string. These tests lock the structural
// serializer that replaces the broken naive approach.

import type { Utxo } from "@cloak.dev/sdk-devnet";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, test } from "vitest";
import {
  type CloakDepositCache,
  cloakDepositCacheKey,
  deserializeCacheEntry,
  deserializeUtxoFromCache,
  serializeCacheEntry,
  serializeUtxoForCache,
} from "../../apps/web/lib/operator-deposit-cache";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

function makeUtxo(): Utxo & { leftSiblingCommitment?: bigint } {
  return {
    amount: 1_000_000n,
    blinding: 0xdeadbeefcafebaben,
    keypair: {
      privateKey: 0x1234567890abcdef1234567890abcdefn,
      publicKey: 0xfedcba0987654321fedcba0987654321n,
    },
    mintAddress: SOL_MINT,
    index: 42,
    commitment: 0xc0ffee1234567890n,
    nullifier: 0xbeef9999n,
    siblingCommitment: 0xfeed8888n,
    leftSiblingCommitment: 0xabcd1111n,
  };
}

describe("operator-deposit-cache: structural serializer", () => {
  test("Utxo round-trips bigints, keypair, and PublicKey identity", () => {
    const original = makeUtxo();
    const serialized = serializeUtxoForCache(original);

    // Confirm the serialized form is plain JSON-compatible.
    expect(() => JSON.stringify(serialized)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(serialized));

    const restored = deserializeUtxoFromCache(parsed) as Utxo & {
      leftSiblingCommitment?: bigint;
    };

    expect(restored.amount).toBe(original.amount);
    expect(restored.blinding).toBe(original.blinding);
    expect(restored.keypair.privateKey).toBe(original.keypair.privateKey);
    expect(restored.keypair.publicKey).toBe(original.keypair.publicKey);
    expect(restored.mintAddress).toBeInstanceOf(PublicKey);
    expect(restored.mintAddress.toBase58()).toBe(original.mintAddress.toBase58());
    expect(restored.index).toBe(original.index);
    expect(restored.commitment).toBe(original.commitment);
    expect(restored.nullifier).toBe(original.nullifier);
    expect(restored.siblingCommitment).toBe(original.siblingCommitment);
    expect(restored.leftSiblingCommitment).toBe(original.leftSiblingCommitment);
  });

  test("Utxo with only required fields survives round-trip", () => {
    const minimal: Utxo = {
      amount: 1n,
      blinding: 2n,
      keypair: { privateKey: 3n, publicKey: 4n },
      mintAddress: SOL_MINT,
    };
    const restored = deserializeUtxoFromCache(
      JSON.parse(JSON.stringify(serializeUtxoForCache(minimal))),
    );
    expect(restored.amount).toBe(1n);
    expect(restored.blinding).toBe(2n);
    expect(restored.keypair.privateKey).toBe(3n);
    expect(restored.keypair.publicKey).toBe(4n);
    expect(restored.mintAddress.toBase58()).toBe(SOL_MINT.toBase58());
    expect(restored.index).toBeUndefined();
    expect(restored.commitment).toBeUndefined();
    expect(restored.nullifier).toBeUndefined();
    expect(restored.siblingCommitment).toBeUndefined();
  });

  test("naive JSON.stringify on a raw Utxo throws — proves the fix is needed", () => {
    expect(() => JSON.stringify(makeUtxo())).toThrow(/BigInt/);
  });

  test("CloakDepositCache round-trips end-to-end through JSON", () => {
    const original: CloakDepositCache = {
      signature: "5JxLg8...sig",
      leafIndex: 17,
      spendKeyHex: "ab".repeat(32),
      blindingHex: "cd".repeat(32),
      outputUtxos: [makeUtxo()],
      withdrawn: true,
      withdrawSignature: "withdraw-sig",
    };

    const json = JSON.stringify(serializeCacheEntry(original));
    const restored = deserializeCacheEntry(JSON.parse(json));

    expect(restored.signature).toBe(original.signature);
    expect(restored.leafIndex).toBe(original.leafIndex);
    expect(restored.spendKeyHex).toBe(original.spendKeyHex);
    expect(restored.blindingHex).toBe(original.blindingHex);
    expect(restored.withdrawn).toBe(true);
    expect(restored.withdrawSignature).toBe("withdraw-sig");
    expect(restored.outputUtxos).toHaveLength(1);
    expect(restored.outputUtxos?.[0]?.amount).toBe(1_000_000n);
  });

  test("withdrawn:false survives so retries know withdraw still needs to run", () => {
    const original: CloakDepositCache = {
      signature: "sig",
      leafIndex: 0,
      spendKeyHex: "00",
      blindingHex: "00",
      outputUtxos: [makeUtxo()],
      withdrawn: false,
    };
    const restored = deserializeCacheEntry(
      JSON.parse(JSON.stringify(serializeCacheEntry(original))),
    );
    expect(restored.withdrawn).toBe(false);
    expect(restored.withdrawSignature).toBeUndefined();
  });

  test("merkleTree is dropped on serialize (not JSON-safe)", () => {
    // We pass a stand-in object — the contract is that serializeCacheEntry
    // must not include it in the output regardless of what's there.
    const original = {
      signature: "sig",
      leafIndex: 0,
      spendKeyHex: "00",
      blindingHex: "00",
      merkleTree: { fake: "wasm-bound" } as unknown,
    } as CloakDepositCache;
    const serialized = serializeCacheEntry(original);
    expect("merkleTree" in serialized).toBe(false);
    // And the JSON output must be parseable.
    expect(() => JSON.parse(JSON.stringify(serialized))).not.toThrow();
  });

  test("cache key is deterministic and namespaced", () => {
    const k1 = cloakDepositCacheKey("multisig-A", "5");
    const k2 = cloakDepositCacheKey("multisig-A", "5");
    const k3 = cloakDepositCacheKey("multisig-B", "5");
    const k4 = cloakDepositCacheKey("multisig-A", "6");
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).not.toBe(k4);
    expect(k1.startsWith("cloak-deposit:")).toBe(true);
  });
});

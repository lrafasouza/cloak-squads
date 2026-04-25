import { PublicKey } from "@solana/web3.js";
import { describe, expect, test } from "vitest";
import { computePayloadHash } from "../src/hashing";
import type { PayloadInvariants } from "../src/types";

function fixture(overrides: Partial<PayloadInvariants> = {}): PayloadInvariants {
  return {
    nullifier: new Uint8Array(32).fill(1),
    commitment: new Uint8Array(32).fill(2),
    amount: 123456789n,
    tokenMint: new PublicKey(new Uint8Array(32).fill(3)),
    recipientVkPub: new Uint8Array(32).fill(4),
    nonce: new Uint8Array(16).fill(5),
    ...overrides,
  };
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("computePayloadHash", () => {
  test("matches the known canonical vector", () => {
    expect(toHex(computePayloadHash(fixture()))).toBe(
      "9f6bf6e5f2187a9e12139dcf5ea724a3b17e8ef5490ff48506135fb781bf2053",
    );
  });

  test("is deterministic", () => {
    expect(toHex(computePayloadHash(fixture()))).toBe(toHex(computePayloadHash(fixture())));
  });

  test("validates fixed-width byte fields", () => {
    expect(() => computePayloadHash(fixture({ nullifier: new Uint8Array(31) }))).toThrow(
      "nullifier must be 32 bytes",
    );
    expect(() => computePayloadHash(fixture({ commitment: new Uint8Array(31) }))).toThrow(
      "commitment must be 32 bytes",
    );
    expect(() => computePayloadHash(fixture({ recipientVkPub: new Uint8Array(31) }))).toThrow(
      "recipientVkPub must be 32 bytes",
    );
    expect(() => computePayloadHash(fixture({ nonce: new Uint8Array(15) }))).toThrow(
      "nonce must be 16 bytes",
    );
  });
});

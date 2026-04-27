import { describe, expect, test } from "vitest";
import { commitmentBigintToBytes, commitmentsEqual } from "../src/commitment";

describe("commitmentsEqual", () => {
  test("returns true for equal byte arrays", () => {
    expect(commitmentsEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  test("returns false for different lengths or bytes", () => {
    expect(commitmentsEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
    expect(commitmentsEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 9, 3]))).toBe(false);
  });
});

describe("commitmentBigintToBytes", () => {
  test("encodes a commitment bigint as 32 big-endian bytes", () => {
    const bytes = commitmentBigintToBytes(0x010203n);

    expect(bytes).toHaveLength(32);
    expect(Array.from(bytes.slice(0, 29))).toEqual(new Array(29).fill(0));
    expect(Array.from(bytes.slice(29))).toEqual([1, 2, 3]);
  });
});

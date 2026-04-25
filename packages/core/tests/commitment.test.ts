import { describe, expect, test } from "vitest";
import { commitmentsEqual } from "../src/commitment";

describe("commitmentsEqual", () => {
  test("returns true for equal byte arrays", () => {
    expect(commitmentsEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  test("returns false for different lengths or bytes", () => {
    expect(commitmentsEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
    expect(commitmentsEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 9, 3]))).toBe(false);
  });
});

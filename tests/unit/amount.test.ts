import { describe, expect, test } from "vitest";
import { solAmountToLamports } from "../../packages/core/src/amount";

describe("solAmountToLamports", () => {
  test("converts whole SOL to lamports", () => {
    expect(solAmountToLamports("1")).toBe(1_000_000_000n);
  });

  test("converts fractional SOL to lamports", () => {
    expect(solAmountToLamports("0.01")).toBe(10_000_000n);
    expect(solAmountToLamports("2.5")).toBe(2_500_000_000n);
  });
});

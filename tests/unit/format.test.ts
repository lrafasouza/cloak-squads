import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatPercent,
  formatSol,
  formatToken,
  formatUsd,
  truncatePubkey,
} from "../../apps/web/lib/format";

describe("formatSol", () => {
  it("formats whole SOL", () => {
    expect(formatSol(1_000_000_000n)).toBe("1");
  });

  it("formats fractional SOL with trimmed trailing zeros", () => {
    expect(formatSol(1_500_000_000n)).toBe("1.5");
    expect(formatSol(1_234_500_000n)).toBe("1.2345");
  });

  it("respects fractionDigits cap", () => {
    expect(formatSol(1_234_567_890n, 2)).toBe("1.23");
  });

  it("handles large numbers with locale grouping", () => {
    expect(formatSol(12_345_000_000_000n)).toBe("12,345");
  });

  it("handles negatives", () => {
    expect(formatSol(-1_500_000_000n)).toBe("-1.5");
  });

  it("zero", () => {
    expect(formatSol(0n)).toBe("0");
  });
});

describe("formatToken", () => {
  it("USDC (6 decimals)", () => {
    expect(formatToken(1_500_000n, 6, { symbol: "USDC" })).toBe("1.5 USDC");
  });

  it("trims trailing zeros", () => {
    expect(formatToken(1_000_000n, 6)).toBe("1");
  });

  it("zero decimals (NFT-style)", () => {
    expect(formatToken(42n, 0)).toBe("42");
  });

  it("respects maxFractionDigits", () => {
    expect(formatToken(1_234_567n, 6, { maxFractionDigits: 2 })).toBe("1.23");
  });
});

describe("formatUsd", () => {
  it("default 2 fraction digits", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });

  it("handles NaN/Infinity safely", () => {
    expect(formatUsd(Number.NaN)).toBe("$0.00");
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe("$0.00");
  });
});

describe("formatPercent", () => {
  it("0.123 → 12.30%", () => {
    expect(formatPercent(0.123)).toBe("12.30%");
  });

  it("handles NaN", () => {
    expect(formatPercent(Number.NaN)).toBe("0%");
  });
});

describe("formatCompact", () => {
  it("12345 → 12.3K", () => {
    expect(formatCompact(12345)).toBe("12.3K");
  });
});

describe("truncatePubkey", () => {
  it("truncates long pubkeys", () => {
    expect(truncatePubkey("AbCdEfGhIjKlMnOpQrStUvWxYz")).toBe("AbCd…WxYz");
  });

  it("returns short pubkeys unchanged", () => {
    expect(truncatePubkey("Short")).toBe("Short");
  });
});

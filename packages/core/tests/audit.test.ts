import { describe, expect, test } from "vitest";
import { computeAuditDiversifier } from "../src/hashing";

const input = {
  linkId: "audit-link-1",
  scope: "time_ranged" as const,
  startDate: 1_714_003_200n,
  endDate: 1_714_089_600n,
};

describe("computeAuditDiversifier", () => {
  test("is deterministic and truncates to 32 bytes", () => {
    const first = computeAuditDiversifier(input);
    const second = computeAuditDiversifier(input);

    expect(first).toHaveLength(32);
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  test("changes when scope changes", () => {
    const full = computeAuditDiversifier({ ...input, scope: "full" });
    const amountsOnly = computeAuditDiversifier({ ...input, scope: "amounts_only" });

    expect(Array.from(full)).not.toEqual(Array.from(amountsOnly));
  });
});

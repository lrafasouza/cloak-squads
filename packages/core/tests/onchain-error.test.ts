import { describe, expect, it } from "vitest";
import { translateOnchainError } from "../src/onchain-error";

describe("translateOnchainError", () => {
  it("detects ConstraintSeeds 2006 on license account as stale proposal", () => {
    const raw =
      'Simulation failed: {"InstructionError":[2,{"Custom":2006}]}\n' +
      "Program log: AnchorError caused by account: license. " +
      "Error Code: ConstraintSeeds. Error Number: 2006. " +
      "Error Message: A seeds constraint was violated.";
    expect(translateOnchainError(raw)).toMatch(/created before a recent program upgrade/i);
  });

  it("does NOT misfire on ConstraintSeeds for a non-license account", () => {
    const raw =
      "Program log: AnchorError caused by account: cofre. " +
      "Error Code: ConstraintSeeds. Error Number: 2006.";
    expect(translateOnchainError(raw)).not.toMatch(/created before a recent program upgrade/i);
  });

  it("recognizes Squads NotAMember (6005)", () => {
    expect(translateOnchainError("NotAMember")).toMatch(/not a member/i);
    expect(translateOnchainError('{"Custom":6005}')).toMatch(/not a member/i);
  });

  it("falls through to the original message when nothing matches", () => {
    expect(translateOnchainError("totally unknown error")).toBe("totally unknown error");
  });

  it("returns a generic message for empty error", () => {
    expect(translateOnchainError("")).toBe("Transaction failed. Please try again.");
  });
});

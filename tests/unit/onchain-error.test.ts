import { describe, expect, test } from "vitest";
import { translateOnchainError } from "../../packages/core/src/onchain-error";

describe("translateOnchainError", () => {
  test("translates Squads NotAMember errors", () => {
    const message =
      "Simulation failed: {\"InstructionError\":[0,{\"Custom\":6005}]} | logs: Program log: AnchorError thrown. Error Code: NotAMember. Error Number: 6005. Error Message: Provided pubkey is not a member of multisig.";

    expect(translateOnchainError(message)).toBe(
      "Connected wallet is not a member of this Squads multisig. Switch to a member wallet, then try again.",
    );
  });

  test("translates uninitialized cofre errors", () => {
    const message =
      "AnchorError caused by account: cofre. Error Code: AccountNotInitialized. Error Number: 3012.";

    expect(translateOnchainError(message)).toContain("Cofre account is not initialized");
  });

  test("preserves unknown errors", () => {
    expect(translateOnchainError("Unexpected failure")).toBe("Unexpected failure");
  });
});

import { describe, expect, test } from "vitest";
import { minimumVaultTopUpLamports, vaultTopUpLamportsNeeded } from "../../packages/core/src/vault-funding";

describe("vaultTopUpLamportsNeeded", () => {
  test("requests the full bootstrap minimum when the vault is empty", () => {
    expect(vaultTopUpLamportsNeeded(0n)).toBe(minimumVaultTopUpLamports);
  });

  test("requests only the difference when the vault is underfunded", () => {
    expect(vaultTopUpLamportsNeeded(minimumVaultTopUpLamports - 1_000n)).toBe(1_000n);
  });

  test("requests no transfer when the vault already has the minimum", () => {
    expect(vaultTopUpLamportsNeeded(minimumVaultTopUpLamports)).toBe(0n);
    expect(vaultTopUpLamportsNeeded(minimumVaultTopUpLamports + 1n)).toBe(0n);
  });
});

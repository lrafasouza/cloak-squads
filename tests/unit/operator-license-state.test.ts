import { describe, expect, test } from "vitest";
import {
  getOperatorExecutionState,
  normalizeLicenseStatus,
} from "../../apps/web/lib/operator-license-state";

describe("operator execution state", () => {
  test("blocks when the Squads proposal is approved but the license account is missing", () => {
    const state = getOperatorExecutionState({
      hasDraft: true,
      walletConnected: true,
      operatorMismatch: false,
      cofreMissing: false,
      lowOperatorSol: false,
      proposalStatus: "approved",
      licenseStatus: "missing",
    });

    expect(state.canExecute).toBe(false);
    expect(state.reason).toBe("execute-vault-transaction");
  });

  test("allows execution only after the license is active", () => {
    const state = getOperatorExecutionState({
      hasDraft: true,
      walletConnected: true,
      operatorMismatch: false,
      cofreMissing: false,
      lowOperatorSol: false,
      proposalStatus: "executed",
      licenseStatus: "active",
    });

    expect(state.canExecute).toBe(true);
    expect(state.reason).toBe("ready");
  });

  test("blocks consumed and expired licenses", () => {
    expect(
      getOperatorExecutionState({
        hasDraft: true,
        walletConnected: true,
        operatorMismatch: false,
        cofreMissing: false,
        lowOperatorSol: false,
        proposalStatus: "executed",
        licenseStatus: "consumed",
      }),
    ).toMatchObject({ canExecute: false, reason: "license-consumed" });

    expect(
      getOperatorExecutionState({
        hasDraft: true,
        walletConnected: true,
        operatorMismatch: false,
        cofreMissing: false,
        lowOperatorSol: false,
        proposalStatus: "executed",
        licenseStatus: "expired",
      }),
    ).toMatchObject({ canExecute: false, reason: "license-expired" });
  });

  test("normalizes Anchor enum variants defensively", () => {
    expect(normalizeLicenseStatus({ active: {} }, 100, 50)).toBe("active");
    expect(normalizeLicenseStatus({ Active: {} }, 100, 50)).toBe("active");
    expect(normalizeLicenseStatus({ __kind: "Consumed" }, 100, 50)).toBe("consumed");
    expect(normalizeLicenseStatus({ active: {} }, 10, 50)).toBe("expired");
  });
});

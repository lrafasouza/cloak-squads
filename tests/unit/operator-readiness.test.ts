import { describe, expect, test } from "vitest";
import {
  canRunOperatorExecution,
  operatorProposalStatusMessage,
} from "../../packages/core/src/operator-readiness";

describe("operator execution readiness", () => {
  test("allows operator execution only after the Squads vault transaction executed", () => {
    expect(canRunOperatorExecution("executed")).toBe(true);
    expect(canRunOperatorExecution("approved")).toBe(false);
    expect(canRunOperatorExecution("other")).toBe(false);
    expect(canRunOperatorExecution("error")).toBe(false);
    expect(canRunOperatorExecution("loading")).toBe(false);
  });

  test("explains that approved proposals still need vault execution", () => {
    expect(operatorProposalStatusMessage("approved")).toContain("Execute the Squads vault transaction");
  });

  test("does not show a blocking message once the license has been issued", () => {
    expect(operatorProposalStatusMessage("executed")).toBeNull();
  });

  test("shows a status check message while readiness is loading", () => {
    expect(operatorProposalStatusMessage("loading")).toContain("Checking proposal status");
  });
});

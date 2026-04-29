import { describe, expect, test } from "vitest";
import { cloakDirectTransactOptions } from "../../packages/core/src/cloak-direct-mode";

describe("cloakDirectTransactOptions", () => {
  test("disables relay and viewing-key registration for direct operator deposits", () => {
    expect(cloakDirectTransactOptions).toEqual({
      relayUrl: "",
      enforceViewingKeyRegistration: false,
    });
  });
});

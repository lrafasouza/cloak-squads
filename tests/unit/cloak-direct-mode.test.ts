import { describe, expect, test } from "vitest";
import { cloakDirectTransactOptions } from "../../packages/core/src/cloak-direct-mode";

describe("cloakDirectTransactOptions", () => {
  test("uses the same-origin relay proxy and skips viewing-key registration", () => {
    expect(cloakDirectTransactOptions).toEqual({
      relayUrl: "/api/cloak-relay",
      enforceViewingKeyRegistration: false,
    });
  });
});

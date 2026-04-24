import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gatekeeperIdlPath = resolve("programs/cloak-gatekeeper/target/idl/cloak_gatekeeper.json");
const mockIdlPath = resolve("programs/cloak-mock/target/idl/cloak_mock.json");

describe("SPIKE: gatekeeper -> cloak-mock CPI", () => {
  it("documents that CPI execution still requires generated Anchor IDLs", () => {
    expect(existsSync(gatekeeperIdlPath)).toBe(false);
    expect(existsSync(mockIdlPath)).toBe(false);
  });
});

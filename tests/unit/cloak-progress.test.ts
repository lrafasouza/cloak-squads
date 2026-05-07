/**
 * Tests for apps/web/lib/cloak-progress.ts — Cloak SDK message translation.
 */

import { describe, expect, test } from "vitest";
import { translateCloakProgress } from "../../apps/web/lib/cloak-progress";

describe("translateCloakProgress", () => {
  test("translates known messages", () => {
    expect(translateCloakProgress("Generating ZK proof")).toBe(
      "Generating zero-knowledge proof...",
    );
    expect(translateCloakProgress("Fetching Merkle proofs")).toBe(
      "Fetching privacy tree proofs...",
    );
  });

  test("strips [cloak] prefix before matching", () => {
    expect(translateCloakProgress("[cloak] Generating ZK proof")).toBe(
      "Generating zero-knowledge proof...",
    );
  });

  test("formats proof percentage", () => {
    expect(translateCloakProgress("proof 42%")).toBe("Generating proof... 42%");
  });

  test("returns the cleaned message when no rule matches", () => {
    expect(translateCloakProgress("[cloak] some unknown text")).toBe("some unknown text");
  });
});

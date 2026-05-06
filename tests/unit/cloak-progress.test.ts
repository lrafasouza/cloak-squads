/**
 * Tests for apps/web/lib/cloak-progress.ts — ZK proof step mapping.
 *
 * Validates that every progress message emitted by the Cloak SDK that we know
 * about is mapped to the right ProofStepId. The mapping drives which etapa of
 * the ProofGenerationState component is highlighted in the operator/claim UI.
 */

import { describe, expect, test } from "vitest";
import {
  type ProofStepId,
  getProofStep,
  getProofStepUpdate,
  isPostProofMessage,
  translateCloakProgress,
} from "../../apps/web/lib/cloak-progress";

describe("getProofStep", () => {
  describe("returns 'load-circuits' for setup-phase messages", () => {
    const cases: string[] = [
      "Validating transaction parameters",
      "[cloak] Validating transaction parameters",
      "Computing commitments",
      "Computing commitment hashes",
      "Computing external data hash",
      "Building transaction",
      "Fetching risk quote",
    ];

    for (const msg of cases) {
      test(`"${msg}"`, () => {
        expect(getProofStep(msg)).toBe<ProofStepId>("load-circuits");
      });
    }
  });

  describe("returns 'generate-witness' for merkle/witness-phase messages", () => {
    const cases: string[] = [
      "Fetching Merkle proofs",
      "[cloak] Fetching Merkle proofs",
      "Using on-chain commitment indices",
      "Syncing commitment indices",
      "withdraw Fetching Merkle proofs",
    ];

    for (const msg of cases) {
      test(`"${msg}"`, () => {
        expect(getProofStep(msg)).toBe<ProofStepId>("generate-witness");
      });
    }
  });

  describe("returns 'prove' for ZK-proof-phase messages", () => {
    const cases: string[] = [
      "Generating ZK proof",
      "[cloak] Generating ZK proof",
      "proof 0%",
      "proof 25%",
      "proof 50%",
      "proof 99%",
      "proof 100%",
      "Converting proof to bytes",
      "withdraw proof 50%",
    ];

    for (const msg of cases) {
      test(`"${msg}"`, () => {
        expect(getProofStep(msg)).toBe<ProofStepId>("prove");
      });
    }
  });

  describe("returns null for post-proof / unrelated messages", () => {
    const cases: string[] = [
      "Submitting deposit transaction",
      "Waiting for wallet signature",
      "Sending transaction",
      "Confirming transaction",
      "Transaction confirmed",
      "Submitting to relay",
      "Transaction submitted",
      "Submit 1/2] Root: 0xabc",
      "",
      "some unknown message",
    ];

    for (const msg of cases) {
      test(`"${msg}"`, () => {
        expect(getProofStep(msg)).toBeNull();
      });
    }
  });

  test("handles [cloak] prefix consistently", () => {
    expect(getProofStep("[cloak] Generating ZK proof")).toBe("prove");
    expect(getProofStep("Generating ZK proof")).toBe("prove");
    expect(getProofStep("[CLOAK] Generating ZK proof")).toBe("prove");
  });

  test("handles 'withdraw' prefix consistently", () => {
    expect(getProofStep("withdraw Fetching Merkle proofs")).toBe("generate-witness");
    expect(getProofStep("Fetching Merkle proofs")).toBe("generate-witness");
  });

  test("phases are checked in order — proof beats witness beats setup", () => {
    // A message that hypothetically matches multiple regexes should resolve to
    // the latest phase to keep the UI from flapping backwards.
    // "Generating ZK proof" is checked first, so even if it also matched
    // "Building" (it doesn't, but hypothetically), proof wins.
    expect(getProofStep("Generating ZK proof")).toBe("prove");
  });
});

describe("isPostProofMessage", () => {
  const postProof: string[] = [
    "Submitting deposit transaction",
    "Submitting to relay",
    "[cloak] Submitting to relay",
    "Sending transaction",
    "Confirming transaction",
    "Waiting for wallet signature",
    "Transaction submitted",
    "Transaction confirmed",
    "Submit 1/2] Root: 0xabc",
  ];
  for (const msg of postProof) {
    test(`true for "${msg}"`, () => {
      expect(isPostProofMessage(msg)).toBe(true);
    });
  }

  const notPostProof: string[] = [
    "Generating ZK proof",
    "proof 50%",
    "Fetching Merkle proofs",
    "Computing commitments",
    "Building transaction",
    "",
    "random unrelated string",
  ];
  for (const msg of notPostProof) {
    test(`false for "${msg}"`, () => {
      expect(isPostProofMessage(msg)).toBe(false);
    });
  }
});

describe("getProofStepUpdate — drives proofStep field in TransactionState", () => {
  test("proof-phase message → sets proofStep to the matching id", () => {
    expect(getProofStepUpdate("Generating ZK proof")).toEqual({ proofStep: "prove" });
    expect(getProofStepUpdate("Fetching Merkle proofs")).toEqual({ proofStep: "generate-witness" });
    expect(getProofStepUpdate("Validating transaction parameters")).toEqual({
      proofStep: "load-circuits",
    });
  });

  test("post-proof message → clears proofStep (null) so the proof UI dismisses", () => {
    // This is the bug we're fixing — without `null`, the operator/claim UI would
    // keep showing "Finalizing privacy shield" while the user is signing the tx
    // and the operator broadcasts to chain.
    expect(getProofStepUpdate("Submitting deposit transaction")).toEqual({ proofStep: null });
    expect(getProofStepUpdate("Waiting for wallet signature")).toEqual({ proofStep: null });
    expect(getProofStepUpdate("Sending transaction")).toEqual({ proofStep: null });
    expect(getProofStepUpdate("Confirming transaction")).toEqual({ proofStep: null });
    expect(getProofStepUpdate("Transaction confirmed")).toEqual({ proofStep: null });
  });

  test("unrelated message → empty patch (preserves current proofStep)", () => {
    expect(getProofStepUpdate("")).toEqual({});
    expect(getProofStepUpdate("totally random string")).toEqual({});
  });

  test("realistic Cloak deposit lifecycle drives the proofStep correctly", () => {
    // Simulates the actual sequence emitted by transact() in production.
    const sequence: Array<[string, { proofStep?: ProofStepId | null }]> = [
      ["Validating transaction parameters", { proofStep: "load-circuits" }],
      ["Computing commitments", { proofStep: "load-circuits" }],
      ["Computing external data hash", { proofStep: "load-circuits" }],
      ["Fetching Merkle proofs", { proofStep: "generate-witness" }],
      ["Generating ZK proof", { proofStep: "prove" }],
      ["proof 50%", { proofStep: "prove" }],
      ["Converting proof to bytes", { proofStep: "prove" }],
      ["Submitting deposit transaction", { proofStep: null }], // ← clears UI
      ["Waiting for wallet signature", { proofStep: null }],
      ["Sending transaction", { proofStep: null }],
      ["Confirming transaction", { proofStep: null }],
      ["Transaction confirmed", { proofStep: null }],
    ];

    for (const [msg, expected] of sequence) {
      expect(getProofStepUpdate(msg)).toEqual(expected);
    }
  });

  test("realistic Cloak withdraw lifecycle (with 'withdraw' prefix) drives proofStep correctly", () => {
    const sequence: Array<[string, { proofStep?: ProofStepId | null }]> = [
      ["[cloak] withdraw Validating transaction parameters", { proofStep: "load-circuits" }],
      ["[cloak] withdraw Fetching Merkle proofs", { proofStep: "generate-witness" }],
      ["[cloak] withdraw Generating ZK proof", { proofStep: "prove" }],
      ["[cloak] withdraw proof 99%", { proofStep: "prove" }],
      ["[cloak] withdraw Submitting to relay", { proofStep: null }],
      ["[cloak] withdraw Transaction confirmed", { proofStep: null }],
    ];

    for (const [msg, expected] of sequence) {
      expect(getProofStepUpdate(msg)).toEqual(expected);
    }
  });
});

describe("translateCloakProgress (regression — existing behavior preserved)", () => {
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

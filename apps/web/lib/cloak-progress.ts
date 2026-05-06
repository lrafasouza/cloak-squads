export type ProofStepId = "load-circuits" | "generate-witness" | "prove";

const CLOAK_MESSAGE_MAP: [RegExp, string][] = [
  [/Validating transaction parameters/i, "Validating transfer parameters..."],
  [/Computing commitments/i, "Computing shielded commitment..."],
  [/Computing external data hash/i, "Hashing transfer data..."],
  [/Fetching Merkle proofs/i, "Fetching privacy tree proofs..."],
  [/Generating ZK proof/i, "Generating zero-knowledge proof..."],
  [/Converting proof to bytes/i, "Encoding proof for submission..."],
  [/Submitting deposit transaction/i, "Awaiting wallet signature for deposit..."],
  [/Building transaction/i, "Building transaction..."],
  [/Fetching risk quote/i, "Fetching risk assessment..."],
  [/Waiting for wallet signature/i, "Waiting for wallet signature..."],
  [/Sending transaction/i, "Broadcasting transaction..."],
  [/Confirming transaction/i, "Confirming on-chain..."],
  [/Transaction confirmed/i, "Transaction confirmed"],
  [/Submitting to relay/i, "Submitting to privacy relay..."],
  [/Transaction submitted/i, "Transaction submitted"],
  [/Using on-chain commitment indices/i, "Syncing commitment indices..."],
  [/Submit \d+\/\d+\] Root:/i, "Submitting merkle root..."],
];

export function translateCloakProgress(raw: string): string {
  const cleaned = raw.replace(/^\[cloak\]\s*/i, "").replace(/^withdraw\s*/i, "");
  for (const [regex, friendly] of CLOAK_MESSAGE_MAP) {
    if (regex.test(cleaned)) return friendly;
  }
  if (/proof \d+%/.test(cleaned)) {
    const match = cleaned.match(/proof (\d+)%/i);
    if (match) return `Generating proof... ${match[1]}%`;
  }
  return cleaned;
}

/**
 * Map a raw Cloak SDK progress message to the corresponding ProofStepId.
 * Returns null for messages that don't belong to the ZK proof pipeline
 * (e.g. wallet-signing or submission steps after the proof is done).
 */
export function getProofStep(raw: string): ProofStepId | null {
  const cleaned = raw.replace(/^\[cloak\]\s*/i, "").replace(/^withdraw\s*/i, "");
  if (/Generating ZK proof|proof \d+%|Converting proof/i.test(cleaned)) return "prove";
  if (/Fetching Merkle|Using on-chain|commitment indices/i.test(cleaned)) return "generate-witness";
  if (
    /Validating|Computing commit|external data hash|Building transaction|Fetching risk/i.test(
      cleaned,
    )
  )
    return "load-circuits";
  return null;
}

/**
 * Detects messages emitted AFTER the proof is done — wallet-signing, broadcast,
 * confirmation, relay submission. UI uses these to dismiss the
 * ProofGenerationState component once we've moved past the ZK phase.
 */
export function isPostProofMessage(raw: string): boolean {
  const cleaned = raw.replace(/^\[cloak\]\s*/i, "").replace(/^withdraw\s*/i, "");
  return /Submitting (deposit|to relay)|Sending transaction|Confirming transaction|Waiting for wallet signature|Transaction (submitted|confirmed)|Submit \d+\/\d+\] Root/i.test(
    cleaned,
  );
}

/**
 * Computes the patch to apply to TransactionState.proofStep based on a Cloak
 * progress message. Returns an empty object when the message is unrelated to
 * the ZK lifecycle (so the existing proofStep is preserved).
 *
 *   - proof-phase message → { proofStep: <id> }
 *   - post-proof message  → { proofStep: null }  (clears the UI)
 *   - anything else       → {}                    (no change)
 */
export function getProofStepUpdate(raw: string): { proofStep?: ProofStepId | null } {
  const step = getProofStep(raw);
  if (step) return { proofStep: step };
  if (isPostProofMessage(raw)) return { proofStep: null };
  return {};
}

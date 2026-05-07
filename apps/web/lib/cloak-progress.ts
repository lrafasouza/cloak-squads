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

/**
 * Challenge-response system for stealth invoice claim-data endpoint.
 *
 * Flow:
 * 1. Client requests a challenge from POST /api/stealth/[id]/challenge
 * 2. Server creates a random challenge + challengeId, stores them
 * 3. Client signs the challenge with their Ed25519 key derived from the box seed
 * 4. Client sends challengeId + derivedPubkey + signature to claim-data endpoint
 * 5. Server verifies: derivedPubkey matches stored stealthPubkey,
 *    signature is valid over the challenge bytes, challenge is fresh
 */

type ChallengeEntry = {
  challengeId: string;
  challenge: Uint8Array;
  createdAt: number;
};

const CHALLENGE_TTL_MS = 60_000;
const challengeStore = new Map<string, ChallengeEntry>();

// Periodic cleanup of expired challenges
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challengeStore) {
    if (now - entry.createdAt > CHALLENGE_TTL_MS) {
      challengeStore.delete(key);
    }
  }
}, 30_000);

function base64urlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Generate and store a challenge for a given invoice ID.
 * Returns { challengeId, challenge } where challenge is base64url-encoded.
 */
export function createChallenge(invoiceId: string): {
  challengeId: string;
  challenge: string;
} {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const challengeId = crypto.randomUUID();

  challengeStore.set(invoiceId, {
    challengeId,
    challenge,
    createdAt: Date.now(),
  });

  return {
    challengeId,
    challenge: base64urlEncode(challenge),
  };
}

/**
 * Check if a challenge exists and is valid for the given invoice ID
 * and challengeId. Returns the raw challenge bytes if valid, null otherwise.
 * Does NOT consume the challenge (call consumeChallenge separately after verification).
 */
export function checkChallenge(invoiceId: string, challengeId: string): Uint8Array | null {
  const entry = challengeStore.get(invoiceId);
  if (!entry) return null;

  if (entry.challengeId !== challengeId) return null;

  // Check TTL
  if (Date.now() - entry.createdAt > CHALLENGE_TTL_MS) {
    challengeStore.delete(invoiceId);
    return null;
  }

  return entry.challenge;
}

/**
 * Consume (delete) a challenge after successful verification.
 * Prevents replay attacks.
 */
export function consumeChallenge(invoiceId: string): void {
  challengeStore.delete(invoiceId);
}

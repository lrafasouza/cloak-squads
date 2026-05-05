import type { Prisma } from "@prisma/client";

export type ProposalDraftRow = Prisma.ProposalDraftGetPayload<Record<string, never>>;

type SerializeDraftOptions = {
  /**
   * Reveal sensitive UTXO secrets (keypairPrivateKey, blinding, sk_spend, r).
   * Operator-only: required to reconstruct and spend the UTXO.
   */
  includeSensitive?: boolean;
  /**
   * Include the public-only commitmentClaim — verifiable invariants
   * (commitment, amount, recipient_vk, token_mint, keypairPublicKey).
   * Vault-member-safe: lets co-signers cross-check what they're approving
   * without exposing material that would let them spend the UTXO.
   */
  includePublicClaim?: boolean;
};

/**
 * Sensitive fields that operator needs but co-signers must NOT see.
 * `keypairPrivateKey` + `blinding` reconstruct the UTXO and let the holder spend it.
 * Legacy `r` and `sk_spend` were equivalent material under the old scheme.
 */
const SENSITIVE_CLAIM_FIELDS = ["keypairPrivateKey", "blinding", "r", "sk_spend"] as const;

function publicClaim(raw: string): unknown {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if ((SENSITIVE_CLAIM_FIELDS as readonly string[]).includes(key)) continue;
    safe[key] = value;
  }
  return safe;
}

export function serializeDraft(draft: ProposalDraftRow, options: SerializeDraftOptions = {}) {
  const { includeSensitive = false, includePublicClaim = false } = options;

  let commitmentClaim: unknown;
  if (draft.commitmentClaim !== null) {
    if (includeSensitive) {
      commitmentClaim = JSON.parse(draft.commitmentClaim);
    } else if (includePublicClaim) {
      commitmentClaim = publicClaim(draft.commitmentClaim);
    }
  }

  return {
    id: draft.id,
    cofreAddress: draft.cofreAddress,
    transactionIndex: draft.transactionIndex,
    amount: draft.amount,
    recipient: draft.recipient,
    memo: draft.memo ?? "",
    payloadHash: Array.from(Buffer.from(draft.payloadHash)),
    invariants: JSON.parse(draft.invariants),
    ...(commitmentClaim !== undefined ? { commitmentClaim } : {}),
    signature: draft.signature ?? undefined,
    createdAt: new Date(draft.createdAt).toISOString(),
    archivedAt: draft.archivedAt ? new Date(draft.archivedAt).toISOString() : null,
  };
}

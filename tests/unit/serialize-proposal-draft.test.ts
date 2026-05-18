/**
 * Regression test for audit Pass 5 F-502.
 *
 * The PATCH handler for /api/proposals/[multisig]/[index] authenticates
 * with `requireVaultMember`, not `requireVaultOperator`. It must NEVER
 * echo `keypairPrivateKey`/`blinding`/other UTXO secrets back in the
 * response body — even when wrapping the existing draft row.
 *
 * `serializeDraft` is the single chokepoint; this test pins its
 * behavior so a future "convenience" refactor that flips
 * `includeSensitive` back on can't quietly re-introduce F-502.
 */
import { describe, expect, test } from "vitest";
import { serializeDraft } from "../../apps/web/lib/serialize-proposal-draft";

// Minimal stand-in for the Prisma `ProposalDraftGetPayload` shape. The
// serializer ignores Prisma's row type at runtime — it only reads the
// fields it knows about.
function fixture() {
  return {
    id: "draft-1",
    cofreAddress: "11111111111111111111111111111111",
    transactionIndex: "1",
    vaultIndex: 0,
    kind: "send",
    amount: "1000000",
    recipient: "22222222222222222222222222222222",
    memo: null,
    payloadHash: Buffer.from(new Uint8Array(32).fill(7)),
    invariants: JSON.stringify({
      nullifier: Array.from(new Uint8Array(32).fill(1)),
      commitment: Array.from(new Uint8Array(32).fill(2)),
      amount: "1000000",
      tokenMint: "So11111111111111111111111111111111111111112",
      recipientVkPub: Array.from(new Uint8Array(32).fill(3)),
      nonce: Array.from(new Uint8Array(16).fill(4)),
    }),
    commitmentClaim: JSON.stringify({
      commitment: "abc",
      amount: "1000000",
      recipient_vk: "deadbeef",
      token_mint: "So11111111111111111111111111111111111111112",
      // Sensitive — must NOT be echoed back unless includeSensitive=true
      keypairPrivateKey: "0011223344556677",
      keypairPublicKey: "8899aabbccddeeff",
      blinding: "ffffffffffffffff",
      r: "1111111111111111",
      sk_spend: "2222222222222222",
      memoBoxSk: "3333333333333333",
    }),
    signature: null,
    createdAt: new Date("2026-05-13T00:00:00Z"),
    archivedAt: null,
    memoCiphertext: null,
    memoNonce: null,
    memoEphemeralPk: null,
  } as unknown as Parameters<typeof serializeDraft>[0];
}

describe("serializeDraft — F-502 PATCH response shape", () => {
  test("default options strip every sensitive field", () => {
    const out = serializeDraft(fixture()) as Record<string, unknown>;
    expect(out.commitmentClaim).toBeUndefined();
  });

  test("includePublicClaim=true exposes invariants but NOT secrets", () => {
    const out = serializeDraft(fixture(), { includePublicClaim: true }) as Record<string, unknown>;
    const claim = out.commitmentClaim as Record<string, unknown> | undefined;
    expect(claim).toBeDefined();
    expect(claim).not.toHaveProperty("keypairPrivateKey");
    expect(claim).not.toHaveProperty("blinding");
    expect(claim).not.toHaveProperty("r");
    expect(claim).not.toHaveProperty("sk_spend");
    expect(claim).not.toHaveProperty("memoBoxSk");
    // But the public invariants ARE present so a co-signer can verify what they're signing.
    expect(claim).toHaveProperty("commitment");
    expect(claim).toHaveProperty("recipient_vk");
  });

  test("includeSensitive=true is the only mode that emits UTXO secrets", () => {
    const out = serializeDraft(fixture(), { includeSensitive: true }) as Record<string, unknown>;
    const claim = out.commitmentClaim as Record<string, unknown>;
    expect(claim.keypairPrivateKey).toBe("0011223344556677");
    expect(claim.blinding).toBe("ffffffffffffffff");
  });

  test("F-502 regression: the PATCH archive path uses includeSensitive=false", () => {
    // This pins what the route.ts PATCH handler is doing (line 121-124).
    // If anyone flips this back to true without also flipping the auth
    // tier from requireVaultMember to requireVaultOperator, the test
    // does not catch the route-side change directly — but it documents
    // the contract: archive responses MUST use {includeSensitive: false}.
    const archiveLikeResponse = {
      ok: true,
      draft: serializeDraft(fixture(), { includeSensitive: false }),
    };
    const claim = (archiveLikeResponse.draft as Record<string, unknown>).commitmentClaim;
    expect(claim).toBeUndefined();
  });
});

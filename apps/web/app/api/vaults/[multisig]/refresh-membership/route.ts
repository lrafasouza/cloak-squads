import { invalidateMembershipCache, requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

/**
 * POST /api/vaults/[multisig]/refresh-membership
 *
 * Drops the in-process membership cache for this multisig. The client should
 * call this after executing any proposal that mutates `members[]` or
 * `threshold` so subsequent API calls re-read the on-chain Multisig account
 * instead of serving stale member lists for up to 60s.
 *
 * Auth: caller must currently be a member of the multisig — but we read
 * membership through the cache that we are about to invalidate, which is
 * exactly the desired semantics: the caller proves they ARE a member
 * (possibly being removed by the very proposal that just executed) before
 * forcing a refresh.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ multisig: string }> },
) {
  const { multisig } = await context.params;

  try {
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  const auth = await requireVaultMember(multisig);
  if (auth instanceof NextResponse) return auth;

  invalidateMembershipCache(multisig);

  return NextResponse.json({ ok: true });
}

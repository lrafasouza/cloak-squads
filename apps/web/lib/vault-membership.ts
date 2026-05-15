/**
 * Server-side vault membership verification.
 *
 * Reads the on-chain Squads Multisig account and checks whether the
 * authenticated wallet is a member. Results are cached for ~15 seconds.
 *
 * Caching strategy (audit Pass 2 + road-to-mainnet B1):
 *   1. Redis (Upstash REST) is the canonical layer when REDIS_URL is set.
 *      All pods see the same view; explicit `invalidateMembershipCache`
 *      reaches every pod through a single DEL.
 *   2. In-memory `Map` is a per-process write-through. Same pod doesn't
 *      re-hit Redis on every call inside the 15s window. Falls back to
 *      sole cache when REDIS_URL is unset (dev) or Redis transiently
 *      errors (rate-limit.ts uses the same fallback shape).
 *
 * Why not lock-and-fetch on a miss: two pods racing the same miss both
 * hit RPC and both write Redis. The work is idempotent and bounded by
 * the 15s TTL — not worth a distributed lock.
 *
 * Failure mode: Redis unreachable → log once, fall through to in-memory
 * + RPC. Membership is gating, not paying; we prefer "serve from a
 * possibly-stale view" over "lock out every member because Redis blipped".
 */
import { publicEnv } from "@/lib/env";
import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import * as multisigSdk from "@sqds/multisig";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

const CACHE_TTL_MS = 15_000;
const CACHE_TTL_SECS = 15;

type MemberCacheEntry = {
  members: string[];
  operator: string | null;
  fetchedAt: number;
};

const memberCache = new Map<string, MemberCacheEntry>();

function memberCacheKey(multisigAddress: string): string {
  return `vm:${multisigAddress}`;
}

// ─── Redis (Upstash REST) ──────────────────────────────────────────────
//
// TODO: this duplicates the inline Upstash REST shape from rate-limit.ts.
// A future refactor should extract a shared `apps/web/lib/redis.ts`
// module that both consumers import. For now, inlined to keep B1 scoped.

async function redisGet(key: string): Promise<string | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  try {
    const res = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: string | null };
    return data.result;
  } catch (err) {
    warnRedisOnce(err);
    return null;
  }
}

async function redisSetEx(key: string, value: string, ttlSecs: number): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  try {
    const url = `${redisUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSecs}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
    });
    if (!res.ok) warnRedisOnce(new Error(`SET HTTP ${res.status}`));
  } catch (err) {
    warnRedisOnce(err);
  }
}

async function redisDel(key: string): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  try {
    const res = await fetch(`${redisUrl}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
    });
    if (!res.ok) warnRedisOnce(new Error(`DEL HTTP ${res.status}`));
  } catch (err) {
    warnRedisOnce(err);
  }
}

function warnRedisOnce(err: unknown) {
  if (!(globalThis as Record<string, unknown>).__vmWarnedOnce) {
    (globalThis as Record<string, unknown>).__vmWarnedOnce = true;
    console.warn(
      "[vault-membership] Redis unreachable — falling back to in-memory cache. Error:",
      err instanceof Error ? err.message : err,
    );
  }
}

// ─── RPC + connection ──────────────────────────────────────────────────

function getConnection() {
  const url = publicEnv.NEXT_PUBLIC_RPC_URL;
  const { Connection } = require("@solana/web3.js") as typeof import("@solana/web3.js");
  return new Connection(url, "confirmed");
}

async function fetchMembersFromRpc(
  multisigAddress: string,
): Promise<{ members: string[]; operator: string | null }> {
  const connection = getConnection();
  const multisigPk = new PublicKey(multisigAddress);

  const ms = await multisigSdk.accounts.Multisig.fromAccountAddress(connection, multisigPk);
  const members = ms.members.map((m: { key: PublicKey }) => m.key.toBase58());

  // Try to read operator from Cofre account (may not exist yet).
  let operator: string | null = null;
  try {
    const gatekeeperProgramId = new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID);
    const [cofreAddr] = PublicKey.findProgramAddressSync(
      [Buffer.from("cofre"), multisigPk.toBytes()],
      gatekeeperProgramId,
    );
    const cofreAccount = await connection.getAccountInfo(cofreAddr);
    if (cofreAccount) {
      // Cofre layout (from IDL): discriminator(8) + multisig(32) + operator(32) + ...
      const operatorBytes = cofreAccount.data.slice(40, 72);
      operator = new PublicKey(operatorBytes).toBase58();
    }
  } catch {
    // Cofre may not exist — operator stays null.
  }

  return { members, operator };
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Fetch the members array for a multisig.
 *
 * Order of operations:
 *   1. In-memory hit (fresh) → return.
 *   2. Redis hit → seed in-memory, return.
 *   3. RPC fetch → write Redis (best-effort) + in-memory, return.
 */
export async function getMultisigMembers(
  multisigAddress: string,
): Promise<{ members: string[]; operator: string | null }> {
  // 1. In-memory fast path
  const cached = memberCache.get(multisigAddress);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { members: cached.members, operator: cached.operator };
  }

  // 2. Redis read
  const redisKey = memberCacheKey(multisigAddress);
  const fromRedis = await redisGet(redisKey);
  if (fromRedis) {
    try {
      const parsed = JSON.parse(fromRedis) as {
        members: string[];
        operator: string | null;
      };
      memberCache.set(multisigAddress, {
        members: parsed.members,
        operator: parsed.operator,
        fetchedAt: Date.now(),
      });
      return { members: parsed.members, operator: parsed.operator };
    } catch {
      // Corrupt entry — fall through to RPC.
    }
  }

  // 3. RPC fallback
  const fresh = await fetchMembersFromRpc(multisigAddress);
  memberCache.set(multisigAddress, { ...fresh, fetchedAt: Date.now() });
  // Best-effort write-through. Fire-and-forget; failures already log via warnRedisOnce.
  void redisSetEx(redisKey, JSON.stringify(fresh), CACHE_TTL_SECS);
  return fresh;
}

/**
 * Verify that the authenticated wallet is a member of the given multisig.
 * Returns the auth result on success, or a 403 NextResponse on failure.
 */
export async function requireVaultMember(
  multisigAddress: string,
): Promise<{ publicKey: string } | NextResponse> {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { members } = await getMultisigMembers(multisigAddress);

    if (!members.includes(auth.publicKey)) {
      return NextResponse.json(
        { error: "You are not a member of this vault." },
        { status: 403 },
      );
    }

    return auth;
  } catch (error) {
    console.error("[vault-membership] failed to read multisig:", error);
    return NextResponse.json(
      { error: "Could not verify vault membership." },
      { status: 500 },
    );
  }
}

/**
 * Verify that the authenticated wallet is the registered operator of the given multisig.
 * Returns the auth result on success, or a 403 NextResponse on failure.
 */
export async function requireVaultOperator(
  multisigAddress: string,
): Promise<{ publicKey: string } | NextResponse> {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { operator } = await getMultisigMembers(multisigAddress);

    if (!operator) {
      return NextResponse.json(
        { error: "No operator registered for this vault." },
        { status: 403 },
      );
    }

    if (auth.publicKey !== operator) {
      return NextResponse.json(
        { error: "Only the vault operator can access this data." },
        { status: 403 },
      );
    }

    return auth;
  } catch (error) {
    console.error("[vault-membership] failed to read operator:", error);
    return NextResponse.json(
      { error: "Could not verify operator status." },
      { status: 500 },
    );
  }
}

/**
 * Verify that a given audit link ID is valid for the given multisig.
 * Used as an alternative to wallet membership for external auditors on the public audit page.
 * Returns true only if the link exists, belongs to the multisig, and has not expired.
 */
export async function verifyAuditLinkAccess(
  multisigAddress: string,
  auditLinkId: string,
): Promise<boolean> {
  if (!isPrismaAvailable()) return false;
  try {
    const link = await prisma.auditLink.findUnique({ where: { id: auditLinkId } });
    return !!link && link.expiresAt >= new Date() && link.cofreAddress === multisigAddress;
  } catch {
    return false;
  }
}

/**
 * Clear the membership cache for a specific multisig (or all if no arg).
 *
 * Targeted (multisigAddress provided): deletes both Redis and in-memory
 * entries for that key. The Redis DEL is broadcast — every pod that reads
 * after the DEL will miss and re-fetch.
 *
 * Untargeted (no arg): clears only the local in-memory map. Redis-wide
 * SCAN+DEL would be expensive and ambiguous (which keys?); we let the
 * 15s TTL expire those.
 */
export async function invalidateMembershipCache(multisigAddress?: string) {
  if (multisigAddress) {
    memberCache.delete(multisigAddress);
    await redisDel(memberCacheKey(multisigAddress));
  } else {
    memberCache.clear();
  }
}

/**
 * Server-side vault membership verification.
 *
 * Reads the on-chain Squads Multisig account and checks whether
 * the authenticated wallet is a member. Results are cached in-memory
 * for 60 seconds to avoid hammering the RPC on every request.
 *
 * Replace the in-memory cache with Redis (Upstash) before mainnet.
 */
import { publicEnv } from "@/lib/env";
import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import * as multisigSdk from "@sqds/multisig";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

const CACHE_TTL_MS = 60_000;

type MemberCacheEntry = {
  members: string[];
  operator: string | null;
  fetchedAt: number;
};

const memberCache = new Map<string, MemberCacheEntry>();

function getConnection() {
  const url = publicEnv.NEXT_PUBLIC_RPC_URL;
  const { Connection } = require("@solana/web3.js") as typeof import("@solana/web3.js");
  return new Connection(url, "confirmed");
}

/**
 * Fetch the members array for a multisig, using a 60s in-memory cache.
 */
export async function getMultisigMembers(
  multisigAddress: string,
): Promise<{ members: string[]; operator: string | null }> {
  const cached = memberCache.get(multisigAddress);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { members: cached.members, operator: cached.operator };
  }

  const connection = getConnection();
  const multisigPk = new PublicKey(multisigAddress);

  const ms = await multisigSdk.accounts.Multisig.fromAccountAddress(connection, multisigPk);
  const members = ms.members.map((m: { key: PublicKey }) => m.key.toBase58());

  // Try to read operator from Cofre account (may not exist yet)
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
      // multisig: bytes 8-39, operator: bytes 40-71
      const operatorBytes = cofreAccount.data.slice(40, 72);
      operator = new PublicKey(operatorBytes).toBase58();
    }
  } catch {
    // Cofre may not exist — operator stays null
  }

  const entry: MemberCacheEntry = { members, operator, fetchedAt: Date.now() };
  memberCache.set(multisigAddress, entry);
  return { members, operator };
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
 * Useful after membership changes.
 */
export function invalidateMembershipCache(multisigAddress?: string) {
  if (multisigAddress) {
    memberCache.delete(multisigAddress);
  } else {
    memberCache.clear();
  }
}

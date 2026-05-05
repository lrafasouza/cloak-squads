import { prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const { linkId } = await context.params;

  // Consume (and ignore) any body — revoke auth is determined solely by the wallet signature.
  try {
    await request.json();
  } catch {
    /* no body is fine */
  }

  try {
    const link = await prisma.auditLink.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      return NextResponse.json({ error: "Audit link not found." }, { status: 404 });
    }

    // Only the wallet that issued the link (proven by wallet signature in headers) may revoke it.
    if (auth.publicKey !== link.issuedBy) {
      return NextResponse.json({ error: "Only the issuer can revoke this link." }, { status: 403 });
    }

    // Delete from DB and return diversifier for on-chain revocation
    const deleted = await prisma.auditLink.delete({
      where: { id: linkId },
    });

    return NextResponse.json({
      success: true,
      diversifier: Array.from(new Uint8Array(deleted.diversifier)),
      cofreAddress: deleted.cofreAddress,
    });
  } catch (error) {
    console.error("[api/audit/revoke] failed:", error);
    return NextResponse.json({ error: "Could not revoke audit link." }, { status: 500 });
  }
}

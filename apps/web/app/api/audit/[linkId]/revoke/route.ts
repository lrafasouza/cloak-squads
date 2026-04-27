import { prisma } from "@/lib/prisma";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

const revokeSchema = z.object({
  issuedBy: z.string().refine(
    (val) => {
      try {
        return PublicKey.isOnCurve(new PublicKey(val).toBytes());
      } catch {
        return false;
      }
    },
    { message: "Invalid issuer address" },
  ),
  signature: z.string().min(64).max(256),
});

export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid revoke request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const link = await prisma.auditLink.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      return NextResponse.json({ error: "Audit link not found." }, { status: 404 });
    }

    if (link.issuedBy !== parsed.data.issuedBy) {
      return NextResponse.json({ error: "Only the issuer can revoke this link." }, { status: 403 });
    }

    // TODO: Call revoke_audit on-chain
    // For now, just delete from DB
    await prisma.auditLink.delete({
      where: { id: linkId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/audit/revoke] failed:", error);
    return NextResponse.json({ error: "Could not revoke audit link." }, { status: 500 });
  }
}

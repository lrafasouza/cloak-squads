import { prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ multisig: string }> },
) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const { multisig } = await params;

  try {
    // Validate multisig address
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  try {
    const drafts = await prisma.payrollDraft.findMany({
      where: { cofreAddress: multisig },
      orderBy: { createdAt: "desc" },
      take: 100, // Limit to prevent abuse
    });

    return NextResponse.json(
      drafts.map((draft) => ({
        id: draft.id,
        cofreAddress: draft.cofreAddress,
        transactionIndex: draft.transactionIndex,
        memo: draft.memo ?? undefined,
        totalAmount: draft.totalAmount,
        recipientCount: draft.recipientCount,
        mode: draft.mode,
        createdAt: new Date(draft.createdAt).toISOString(),
      })),
    );
  } catch (error) {
    console.error("[api/payrolls] list failed:", error);
    return NextResponse.json({ error: "Could not list payroll drafts." }, { status: 500 });
  }
}

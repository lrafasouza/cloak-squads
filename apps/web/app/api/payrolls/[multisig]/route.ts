import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ multisig: string }> },
) {
  const { multisig } = await params;

  try {
    const drafts = await prisma.payrollDraft.findMany({
      where: { cofreAddress: multisig },
      include: { recipients: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      drafts.map((draft) => ({
        id: draft.id,
        cofreAddress: draft.cofreAddress,
        transactionIndex: draft.transactionIndex,
        memo: draft.memo ?? undefined,
        totalAmount: draft.totalAmount,
        recipientCount: draft.recipientCount,
        createdAt: new Date(draft.createdAt).toISOString(),
      })),
    );
  } catch (error) {
    console.error("[api/payrolls] list failed:", error);
    return NextResponse.json({ error: "Could not list payroll drafts." }, { status: 500 });
  }
}

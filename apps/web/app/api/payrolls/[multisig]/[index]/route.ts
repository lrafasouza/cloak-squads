import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ multisig: string; index: string }> },
) {
  const { multisig, index } = await params;

  try {
    const draft = await prisma.payrollDraft.findFirst({
      where: {
        cofreAddress: multisig,
        transactionIndex: index,
      },
      include: { recipients: true },
    });

    if (!draft) {
      return NextResponse.json({ error: "Payroll draft not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: draft.id,
      cofreAddress: draft.cofreAddress,
      transactionIndex: draft.transactionIndex,
      memo: draft.memo ?? undefined,
      totalAmount: draft.totalAmount,
      recipientCount: draft.recipientCount,
      recipients: draft.recipients.map((r) => ({
        id: r.id,
        name: r.name,
        wallet: r.wallet,
        amount: r.amount,
        memo: r.memo ?? undefined,
        payloadHash: Array.from(Buffer.from(r.payloadHash)),
        invariants: JSON.parse(r.invariants),
        commitmentClaim: r.commitmentClaim !== null ? JSON.parse(r.commitmentClaim) : undefined,
        signature: r.signature ?? undefined,
      })),
      createdAt: new Date(draft.createdAt).toISOString(),
    });
  } catch (error) {
    console.error("[api/payrolls] get failed:", error);
    return NextResponse.json({ error: "Could not load payroll draft." }, { status: 500 });
  }
}

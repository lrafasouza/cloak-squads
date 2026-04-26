import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeDraft } from "@/lib/serialize-proposal-draft";

export async function GET(
  _request: Request,
  context: { params: Promise<{ multisig: string }> },
) {
  const { multisig } = await context.params;
  const drafts = await prisma.proposalDraft.findMany({
    where: { cofreAddress: multisig },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(drafts.map(serializeDraft));
}

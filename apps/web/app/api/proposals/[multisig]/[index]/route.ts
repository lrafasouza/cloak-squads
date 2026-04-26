import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeDraft } from "@/lib/serialize-proposal-draft";

export async function GET(
  _request: Request,
  context: { params: Promise<{ multisig: string; index: string }> },
) {
  const { multisig, index } = await context.params;
  const draft = await prisma.proposalDraft.findFirst({
    where: { cofreAddress: multisig, transactionIndex: index },
  });

  if (!draft) {
    return NextResponse.json({ error: "Proposal draft not found." }, { status: 404 });
  }

  return NextResponse.json(serializeDraft(draft));
}

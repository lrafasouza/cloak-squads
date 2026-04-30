import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { serializeDraft } from "@/lib/serialize-proposal-draft";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(request: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig } = await context.params;

  try {
    // Validate multisig address
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json([]);
  }

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  try {
    const drafts = await prisma.proposalDraft.findMany({
      where: {
        cofreAddress: multisig,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(drafts.map((draft) => serializeDraft(draft)));
  } catch (error) {
    console.error("[api/proposals] list failed:", error);
    return NextResponse.json({ error: "Could not list proposal drafts." }, { status: 500 });
  }
}

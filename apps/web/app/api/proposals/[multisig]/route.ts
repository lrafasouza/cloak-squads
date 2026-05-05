import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { serializeDraft } from "@/lib/serialize-proposal-draft";
import { requireVaultMember, verifyAuditLinkAccess } from "@/lib/vault-membership";
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

  const url = new URL(request.url);
  const auditLinkId = url.searchParams.get("auditLinkId");

  if (auditLinkId) {
    // External auditors authenticate via a valid audit link instead of wallet membership.
    const allowed = await verifyAuditLinkAccess(multisig, auditLinkId);
    if (!allowed) {
      return NextResponse.json({ error: "Invalid or expired audit link." }, { status: 403 });
    }
  } else {
    const auth = await requireVaultMember(multisig);
    if (auth instanceof NextResponse) return auth;
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json([]);
  }

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

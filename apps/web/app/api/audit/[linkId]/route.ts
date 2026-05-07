import { recordAuditAccess } from "@/lib/audit-access";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await context.params;

  try {
    const link = await prisma.auditLink.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      return NextResponse.json({ error: "Audit link not found." }, { status: 404 });
    }

    if (link.expiresAt < new Date()) {
      return NextResponse.json({ error: "Audit link expired." }, { status: 410 });
    }

    const hdrs = await headers();
    const rawIp = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? null;
    const ip = rawIp ? (rawIp.split(",")[0] ?? rawIp).trim() : null;
    const userAgent = hdrs.get("user-agent");
    void recordAuditAccess(linkId, "view", { ip, userAgent });

    // Return only metadata — never the diversifier or signature
    return NextResponse.json({
      id: link.id,
      cofreAddress: link.cofreAddress,
      scope: link.scope,
      scopeParams: link.scopeParams,
      expiresAt: link.expiresAt.toISOString(),
      issuedBy: link.issuedBy,
      createdAt: link.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[api/audit] get failed:", error);
    return NextResponse.json({ error: "Could not fetch audit link." }, { status: 500 });
  }
}

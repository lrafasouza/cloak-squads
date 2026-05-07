import { recordAuditAccess } from "@/lib/audit-access";
import { loadAuditTransactions } from "@/lib/audit-data";
import { signAuditExport } from "@/lib/audit-sign";
import { prisma } from "@/lib/prisma";
import { exportAuditToCSV } from "@cloak-squads/core/audit";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const exportSchema = z.object({
  format: z.enum(["csv", "json"]),
});

export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export request." }, { status: 400 });
  }

  try {
    const link = await prisma.auditLink.findUnique({ where: { id: linkId } });
    if (!link) {
      return NextResponse.json({ error: "Audit link not found." }, { status: 404 });
    }
    if (link.expiresAt < new Date()) {
      return NextResponse.json({ error: "Audit link expired." }, { status: 410 });
    }

    let scopeParams: { startDate?: number; endDate?: number } = {};
    if (link.scopeParams) {
      try {
        scopeParams = JSON.parse(link.scopeParams) as typeof scopeParams;
      } catch {
        scopeParams = {};
      }
    }

    const transactions = await loadAuditTransactions({
      cofreAddress: link.cofreAddress,
      scope: link.scope as "full" | "amounts_only" | "time_ranged",
      scopeParams,
    });

    const data =
      parsed.data.format === "csv"
        ? exportAuditToCSV(transactions)
        : JSON.stringify(
            {
              linkId,
              vault: link.cofreAddress,
              exportedAt: new Date().toISOString(),
              scope: link.scope,
              scopeParams: link.scopeParams,
              transactions,
            },
            null,
            2,
          );

    const signed = signAuditExport({
      vault: link.cofreAddress,
      linkId,
      contentType: parsed.data.format === "csv" ? "text/csv" : "application/json",
      data,
    });

    const hdrs = await headers();
    const rawIp = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? null;
    const ip = rawIp ? (rawIp.split(",")[0] ?? rawIp).trim() : null;
    const userAgent = hdrs.get("user-agent");
    void recordAuditAccess(linkId, parsed.data.format === "csv" ? "export_csv" : "export_json", {
      ip,
      userAgent,
    });

    return NextResponse.json(signed);
  } catch (error) {
    console.error("[api/audit/export] failed:", error);
    return NextResponse.json({ error: "Could not generate export." }, { status: 500 });
  }
}

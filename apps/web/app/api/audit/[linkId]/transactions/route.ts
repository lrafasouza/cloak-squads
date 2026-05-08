import { recordAuditAccess } from "@/lib/audit-access";
import { loadAuditTransactions } from "@/lib/audit-data";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Canonical audit-transactions endpoint.
 *
 * Replaces the previous viewer flow where the public page hit
 * `/api/proposals` and `/api/payrolls` separately and merged them client-side
 * (which silently dropped income, swaps, stealth invoices, and collapsed
 * payroll batches into a single row). All categories now flow through
 * `loadAuditTransactions`, which is the same function the signed export
 * uses — viewer and CSV are guaranteed to agree.
 *
 * Auth: the link itself is the bearer credential. Anyone with `linkId` +
 * fragment can hit this; the fragment is not validated server-side (it's
 * client-only), so we treat the linkId alone as the access token. Existence
 * + non-expiry of the row in `AuditLink` is the gate.
 */
export async function GET(_request: Request, context: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await context.params;

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

    const hdrs = await headers();
    const rawIp = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? null;
    const ip = rawIp ? (rawIp.split(",")[0] ?? rawIp).trim() : null;
    const userAgent = hdrs.get("user-agent");
    void recordAuditAccess(linkId, "view", { ip, userAgent });

    return NextResponse.json({
      linkId: link.id,
      vault: link.cofreAddress,
      scope: link.scope,
      transactions,
      count: transactions.length,
    });
  } catch (error) {
    console.error("[api/audit/transactions] failed:", error);
    return NextResponse.json({ error: "Could not load audit transactions." }, { status: 500 });
  }
}

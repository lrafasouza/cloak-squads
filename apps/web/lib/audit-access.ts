import { prisma } from "@/lib/prisma";

// Distinct actions for each endpoint so the 60s dedupe doesn't collapse
// metadata + transactions fetches into one row (audit Pass 2 F-101).
// "view" stays for backward compatibility with historical rows. New
// transaction-data fetches log as "view_transactions".
export type AuditAction = "view" | "view_transactions" | "export_csv" | "export_json";

/**
 * Record an access to a public audit link.
 *
 * Rate-limited at the DB layer to 1 entry / IP / minute / link / action so that
 * a regulator hitting the page hard during a session doesn't fill the table
 * with duplicate rows. We use a SELECT-then-INSERT pattern instead of an
 * UPSERT because we genuinely want multiple rows over time, just not a burst.
 *
 * Errors here are swallowed — losing one log entry is preferable to failing
 * the audit GET. Failures are surfaced to console for ops.
 */
export async function recordAuditAccess(
  auditLinkId: string,
  action: AuditAction,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recent = await prisma.auditAccessLog.findFirst({
      where: {
        auditLinkId,
        action,
        ip: meta.ip ?? null,
        accessedAt: { gte: oneMinuteAgo },
      },
      select: { id: true },
    });
    if (recent) return; // recently logged for this IP+action

    await prisma.auditAccessLog.create({
      data: {
        auditLinkId,
        action,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 256) : null,
      },
    });
  } catch (error) {
    console.error("[audit-access] failed to record:", error);
  }
}

import { prisma } from "@/lib/prisma";
import type { FilteredAuditTransaction } from "@cloak-squads/core/audit";

/**
 * Pull real transaction history for an audit link from the application DB.
 *
 * The public viewer (`/audit/[linkId]`) and the admin page need to render the
 * same set of rows; this is the shared source of truth. We surface
 * ProposalDraft + PayrollDraft entries; archived (failed/cancelled) drafts are
 * marked as `failed` so the auditor sees the full picture, not just successes.
 */
export async function loadAuditTransactions(args: {
  cofreAddress: string;
  scope: "full" | "amounts_only" | "time_ranged";
  scopeParams?: { startDate?: number; endDate?: number };
  limit?: number;
}): Promise<FilteredAuditTransaction[]> {
  const limit = args.limit ?? 200;

  const [drafts, payrolls] = await Promise.all([
    prisma.proposalDraft.findMany({
      where: { cofreAddress: args.cofreAddress },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.payrollDraft.findMany({
      where: { cofreAddress: args.cofreAddress },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const out: FilteredAuditTransaction[] = [];

  for (const d of drafts) {
    out.push({
      type: "transfer",
      amount: d.amount,
      nullifier: args.scope === "amounts_only" ? "REDACTED" : d.recipient.slice(0, 16),
      status: d.archivedAt ? "failed" : "confirmed",
      timestamp: d.createdAt.getTime(),
    });
  }

  for (const p of payrolls) {
    out.push({
      type: "transfer",
      amount: p.totalAmount,
      nullifier: args.scope === "amounts_only" ? "REDACTED" : `payroll:${p.recipientCount}`,
      status: "confirmed",
      timestamp: p.createdAt.getTime(),
    });
  }

  // Time-range filter
  const startDate = args.scopeParams?.startDate;
  const endDate = args.scopeParams?.endDate;
  if (args.scope === "time_ranged" && startDate !== undefined && endDate !== undefined) {
    return out
      .filter((tx) => tx.timestamp >= startDate && tx.timestamp <= endDate)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  return out.sort((a, b) => b.timestamp - a.timestamp);
}

import { getCurrentCluster } from "@/lib/cluster";
import { prisma } from "@/lib/prisma";
import type { FilteredAuditTransaction } from "@cloak-squads/core/audit";

/**
 * Pull real transaction history for an audit link from the application DB.
 *
 * Source of truth for both the public viewer (`/audit/[linkId]`) and the
 * signed export endpoint. Surfaces every category that affects the vault's
 * money picture so an external auditor can reconcile income against outflow:
 *
 *   - ProposalDraft   → outbound transfers (private + public sends)
 *   - PayrollDraft    → expanded one row per recipient
 *   - SwapDraft       → in-vault swaps
 *   - StealthInvoice  → shielded invoices (claimed = paid; pending = open)
 *   - VaultIncome     → on-chain deposits indexed from the chain
 *
 * Filtering rules:
 *   - Cluster is enforced at every query so devnet rows can never leak into
 *     a mainnet export.
 *   - Time-range scope pushes the filter into SQL (using each table's
 *     timestamp column — `createdAt` for drafts, `blockTime` for income).
 *     Filtering after `findMany take: N` would silently truncate audits of
 *     historical windows because the latest 200 rows could all be outside
 *     the requested range.
 *   - "amounts_only" scope redacts the nullifier client-facing string but
 *     keeps amounts intact (matches the existing scope semantic).
 */
export async function loadAuditTransactions(args: {
  cofreAddress: string;
  scope: "full" | "amounts_only" | "time_ranged";
  scopeParams?: { startDate?: number; endDate?: number };
  limit?: number;
}): Promise<FilteredAuditTransaction[]> {
  const limit = args.limit ?? 200;
  const cluster = getCurrentCluster();
  const baseWhere = { cofreAddress: args.cofreAddress, cluster };

  const redact = args.scope === "amounts_only";

  // Push the date window into SQL so each `findMany` returns rows actually
  // inside the audit scope, not "the latest 200 then maybe filter to zero".
  // PayrollDraft, ProposalDraft, SwapDraft, StealthInvoice all key off
  // `createdAt`. VaultIncome uses `blockTime` (chain timestamp). When the
  // window is open-ended on either side, omit that bound.
  const startDate = args.scopeParams?.startDate;
  const endDate = args.scopeParams?.endDate;
  const wantsRange =
    args.scope === "time_ranged" && startDate !== undefined && endDate !== undefined;

  const createdAtFilter = wantsRange
    ? { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } }
    : {};
  const blockTimeFilter = wantsRange
    ? { blockTime: { gte: new Date(startDate), lte: new Date(endDate) } }
    : {};

  const [proposals, payrolls, swaps, invoices, incomes] = await Promise.all([
    prisma.proposalDraft.findMany({
      where: { ...baseWhere, ...createdAtFilter },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.payrollDraft.findMany({
      where: { ...baseWhere, ...createdAtFilter },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { recipients: true },
    }),
    prisma.swapDraft.findMany({
      where: { ...baseWhere, ...createdAtFilter },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.stealthInvoice.findMany({
      where: { ...baseWhere, ...createdAtFilter },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.vaultIncome.findMany({
      where: { ...baseWhere, ...blockTimeFilter },
      orderBy: { blockTime: "desc" },
      take: limit,
    }),
  ]);

  const out: FilteredAuditTransaction[] = [];

  for (const draft of proposals) {
    out.push({
      type: "transfer",
      subtype: "send",
      amount: draft.amount,
      nullifier: redact ? "REDACTED" : draft.recipient.slice(0, 16),
      // archivedAt is set when a draft is cancelled/superseded — surface it
      // so the auditor sees the failure, not just the happy path.
      status: draft.archivedAt ? "failed" : "confirmed",
      timestamp: draft.createdAt.getTime(),
      vaultIndex: draft.vaultIndex,
    });
  }

  for (const payroll of payrolls) {
    // Each recipient gets its own row. A payroll batch with 5 recipients
    // shows 5 transfers in the audit, not "1 transfer of $X to payroll:5"
    // — the latter is a regulatory red flag (looks like structuring).
    for (const recipient of payroll.recipients) {
      out.push({
        type: "transfer",
        subtype: "payroll",
        amount: recipient.amount,
        nullifier: redact ? "REDACTED" : recipient.wallet.slice(0, 16),
        status: "confirmed",
        timestamp: payroll.createdAt.getTime(),
        vaultIndex: payroll.vaultIndex,
      });
    }
    if (payroll.recipients.length === 0) {
      // Defensive: a payroll draft with zero recipients should never exist
      // (POST validates min(1)), but if one slipped through we still want
      // to surface its existence rather than silently drop it.
      out.push({
        type: "transfer",
        subtype: "payroll",
        amount: payroll.totalAmount,
        nullifier: redact ? "REDACTED" : `payroll-empty:${payroll.id.slice(0, 8)}`,
        status: "failed",
        timestamp: payroll.createdAt.getTime(),
        vaultIndex: payroll.vaultIndex,
      });
    }
  }

  for (const swap of swaps) {
    out.push({
      type: "transfer",
      subtype: "swap",
      amount: swap.inputAmount,
      nullifier: redact
        ? "REDACTED"
        : `${swap.inputSymbol}→${swap.outputSymbol}`,
      status: "confirmed",
      timestamp: swap.createdAt.getTime(),
      vaultIndex: swap.vaultIndex,
    });
  }

  for (const invoice of invoices) {
    // Stealth invoices are inbound from the vault's perspective: the vault
    // collects funds via a private claim. Pending = link issued, no claim
    // yet. Claimed = paid. Anything else (expired, revoked) shows failed.
    const status: FilteredAuditTransaction["status"] =
      invoice.status === "claimed"
        ? "confirmed"
        : invoice.status === "pending"
          ? "pending"
          : "failed";
    out.push({
      type: "deposit",
      subtype: "invoice",
      amount: invoice.utxoAmount ?? undefined,
      nullifier: redact
        ? "REDACTED"
        : `invoice:${invoice.id.slice(0, 8)}`,
      status,
      timestamp: (invoice.claimedAt ?? invoice.createdAt).getTime(),
      vaultIndex: invoice.vaultIndex,
    });
  }

  for (const income of incomes) {
    out.push({
      type: "deposit",
      subtype: "income",
      amount: income.amountLamports,
      nullifier: redact ? "REDACTED" : income.fromAddress.slice(0, 16),
      status: "confirmed",
      timestamp: income.blockTime.getTime(),
      vaultIndex: income.vaultIndex,
    });
  }

  return out.sort((a, b) => b.timestamp - a.timestamp);
}

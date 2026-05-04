"use client";

import type { Connection, PublicKey } from "@solana/web3.js";
import * as squadsMultisig from "@sqds/multisig";

export type ProposalStatusKind =
  | "draft"
  | "active"
  | "approved"
  | "rejected"
  | "executing"
  | "executed"
  | "cancelled"
  | "unknown";

export type ProposalSummaryType = "single" | "payroll" | "onchain";

export type ProposalSummary = {
  id: string;
  transactionIndex: string;
  amount: string;
  recipient: string;
  memo: string;
  title: string;
  createdAt: string;
  type: ProposalSummaryType;
  recipientCount?: number;
  totalAmount?: string;
  status?: ProposalStatusKind;
  approvals?: number;
  threshold?: number;
  hasDraft: boolean;
};

export function isProposalPendingStatus(status: ProposalStatusKind | undefined): boolean {
  return (
    status === undefined ||
    status === "draft" ||
    status === "active" ||
    status === "approved" ||
    status === "executing"
  );
}

type ApiDraftSummary = {
  id: string;
  transactionIndex: string;
  amount: string;
  recipient: string;
  memo: string;
  createdAt: string;
  recipientCount?: number;
  totalAmount?: string;
};

export function readProposalStatus(status: unknown): ProposalStatusKind {
  if (status && typeof status === "object") {
    const kind = (status as { __kind?: unknown }).__kind;
    const key = typeof kind === "string" ? kind.toLowerCase() : undefined;
    if (
      key === "draft" ||
      key === "active" ||
      key === "approved" ||
      key === "rejected" ||
      key === "executing" ||
      key === "executed" ||
      key === "cancelled"
    ) {
      return key;
    }
  }
  return "unknown";
}

export async function loadPersistedProposalSummaries(
  multisigAddress: PublicKey,
): Promise<ProposalSummary[]> {
  const [singleRes, payrollRes] = await Promise.all([
    fetch(`/api/proposals/${encodeURIComponent(multisigAddress.toBase58())}`),
    fetch(`/api/payrolls/${encodeURIComponent(multisigAddress.toBase58())}`),
  ]);

  const singleDrafts: ProposalSummary[] = singleRes.ok
    ? ((await singleRes.json()) as ApiDraftSummary[]).map((draft) => ({
        ...draft,
        type: "single" as const,
        title: draft.memo || `${draft.amount} SOL → ${truncateAddress(draft.recipient)}`,
        hasDraft: true,
      }))
    : [];

  const payrollDrafts: ProposalSummary[] = payrollRes.ok
    ? ((await payrollRes.json()) as ApiDraftSummary[]).map((draft) => ({
        ...draft,
        type: "payroll" as const,
        recipientCount: draft.recipientCount ?? 0,
        totalAmount: draft.totalAmount ?? "0",
        amount: draft.totalAmount ?? "0",
        recipient: `${draft.recipientCount ?? 0} recipients`,
        title: draft.memo || `Payroll — ${draft.recipientCount ?? 0} recipients`,
        hasDraft: true,
      }))
    : [];

  return [...singleDrafts, ...payrollDrafts];
}

function parseConfigActionTitle(actions: unknown[]): string {
  if (!actions || actions.length === 0) return "Config change";
  const parts = actions.map((action: unknown) => {
    if (action && typeof action === "object") {
      const kind = (action as { __kind?: unknown }).__kind;
      if (kind === "AddMember") {
        const newMember = (action as { newMember?: { key?: { toBase58?: () => string } } }).newMember;
        const addr = newMember?.key?.toBase58?.() ?? "unknown";
        return `Add member ${truncateAddress(addr)}`;
      }
      if (kind === "RemoveMember") {
        const oldMember = (action as { oldMember?: { toBase58?: () => string } }).oldMember;
        const addr = oldMember?.toBase58?.() ?? "unknown";
        return `Remove member ${truncateAddress(addr)}`;
      }
      if (kind === "ChangeThreshold") {
        const newThreshold = (action as { newThreshold?: number }).newThreshold;
        return `Change threshold to ${newThreshold ?? "?"}`;
      }
    }
    return "Config change";
  });
  return parts.join(", ");
}

export async function loadOnchainProposalSummaries(params: {
  connection: Connection;
  multisigAddress: PublicKey;
  limit?: number;
}): Promise<ProposalSummary[]> {
  const { connection, multisigAddress, limit = 25 } = params;
  const account = await squadsMultisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigAddress,
  );
  const latestIndex = BigInt(account.transactionIndex.toString());
  const threshold = Number(account.threshold);
  if (latestIndex === 0n) return [];

  const indexes: bigint[] = [];
  for (let index = latestIndex; index > 0n && indexes.length < limit; index -= 1n) {
    indexes.push(index);
  }

  const proposals: Array<ProposalSummary | null> = await Promise.all(
    indexes.map(async (index) => {
      const proposalPda = getProposalPdaForIndex(multisigAddress, index);
      try {
        const proposal = await squadsMultisig.accounts.Proposal.fromAccountAddress(
          connection,
          proposalPda,
        );

        // Try to read the underlying transaction account for memo/action details
        const [transactionPda] = squadsMultisig.getTransactionPda({
          multisigPda: multisigAddress,
          index,
        });

        let title = "";
        let txType: ProposalSummaryType = "onchain";

        const [configTxResult, vaultTxResult] = await Promise.allSettled([
          squadsMultisig.accounts.ConfigTransaction.fromAccountAddress(connection, transactionPda),
          squadsMultisig.accounts.VaultTransaction.fromAccountAddress(connection, transactionPda),
        ]);

        if (configTxResult.status === "fulfilled") {
          title = parseConfigActionTitle(configTxResult.value.actions as unknown[]);
          txType = "onchain";
        } else if (vaultTxResult.status === "fulfilled") {
          const ixCount = vaultTxResult.value.message.instructions.length;
          title = ixCount > 0 ? `Vault transaction (${ixCount} instruction${ixCount > 1 ? "s" : ""})` : "Vault transaction";
          txType = "onchain";
        } else {
          title = "On-chain proposal";
        }

        return {
          id: `onchain-${index.toString()}`,
          transactionIndex: index.toString(),
          amount: "0",
          recipient: "Squads vault transaction",
          memo: "",
          title,
          createdAt: new Date(0).toISOString(),
          type: txType,
          status: readProposalStatus(proposal.status),
          approvals: proposal.approved.length,
          threshold,
          hasDraft: false,
        };
      } catch {
        return null;
      }
    }),
  );

  return proposals.filter((proposal): proposal is ProposalSummary => proposal !== null);
}

export function getProposalPdaForIndex(multisigAddress: PublicKey, transactionIndex: bigint) {
  const [proposalPda] = squadsMultisig.getProposalPda({
    multisigPda: multisigAddress,
    transactionIndex,
  });
  return proposalPda;
}

export function mergeProposalSummaries(
  persisted: ProposalSummary[],
  onchain: ProposalSummary[],
): ProposalSummary[] {
  const byIndex = new Map<string, ProposalSummary>();

  for (const proposal of onchain) {
    byIndex.set(proposal.transactionIndex, proposal);
  }

  for (const draft of persisted) {
    const chain = byIndex.get(draft.transactionIndex);
    const merged: ProposalSummary = {
      ...draft,
      hasDraft: true,
    };
    if (chain?.status !== undefined) merged.status = chain.status;
    if (chain?.approvals !== undefined) merged.approvals = chain.approvals;
    if (chain?.threshold !== undefined) merged.threshold = chain.threshold;
    // Use on-chain title if persisted draft has no memo-based title (e.g. config actions)
    if (chain?.title && (!draft.title || draft.title === draft.memo)) {
      merged.title = chain.title;
    }
    byIndex.set(draft.transactionIndex, merged);
  }

  return [...byIndex.values()].sort((a, b) => {
    const indexDelta = Number(BigInt(b.transactionIndex) - BigInt(a.transactionIndex));
    if (indexDelta !== 0) return indexDelta;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

"use client";

import type { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

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
  createdAt: string;
  type: ProposalSummaryType;
  recipientCount?: number;
  totalAmount?: string;
  status?: ProposalStatusKind;
  approvals?: number;
  threshold?: number;
  hasDraft: boolean;
};

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
        hasDraft: true,
      }))
    : [];

  return [...singleDrafts, ...payrollDrafts];
}

export async function loadOnchainProposalSummaries(params: {
  connection: Connection;
  multisigAddress: PublicKey;
  limit?: number;
}): Promise<ProposalSummary[]> {
  const { connection, multisigAddress, limit = 25 } = params;
  const account = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigAddress);
  const latestIndex = BigInt(account.transactionIndex.toString());
  const threshold = Number(account.threshold);
  if (latestIndex === 0n) return [];

  const indexes: bigint[] = [];
  for (let index = latestIndex; index > 0n && indexes.length < limit; index -= 1n) {
    indexes.push(index);
  }

  const proposals: Array<ProposalSummary | null> = await Promise.all(
    indexes.map(async (index) => {
      const [proposalPda] = multisig.getProposalPda({
        multisigPda: multisigAddress,
        transactionIndex: index,
      });
      try {
        const proposal = await multisig.accounts.Proposal.fromAccountAddress(
          connection,
          proposalPda,
        );
        return {
          id: `onchain-${index.toString()}`,
          transactionIndex: index.toString(),
          amount: "0",
          recipient: "Squads vault transaction",
          memo: "On-chain proposal",
          createdAt: new Date(0).toISOString(),
          type: "onchain" as const,
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

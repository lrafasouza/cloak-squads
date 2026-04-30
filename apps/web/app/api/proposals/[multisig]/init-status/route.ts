import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { NextResponse } from "next/server";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const SQUADS_PROGRAM_ID = process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID;

function serverConnection(): Connection {
  return new Connection(RPC_URL, { commitment: "confirmed" });
}

export type InitStatusResponse = {
  hasPendingInit: boolean;
  pendingTxIndex: string | null;
  pendingProposalPda: string | null;
  onChainTransactionIndex: string;
  onChainStaleTransactionIndex: string;
  dbDraftCount: number;
};

const PENDING_KINDS = new Set(["Draft", "Active", "Approved", "Executing"]);

export async function GET(_request: Request, context: { params: Promise<{ multisig: string }> }) {
  const { multisig: multisigAddress } = await context.params;

  try {
    new PublicKey(multisigAddress);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  const multisigPda = new PublicKey(multisigAddress);

  // 1. Read on-chain Multisig account to get transaction index range
  let onChainTxIndex: bigint;
  let onChainStaleTxIndex: bigint;
  try {
    const connection = serverConnection();
    const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
    onChainTxIndex = BigInt(ms.transactionIndex.toString());
    onChainStaleTxIndex = BigInt(ms.staleTransactionIndex.toString());
  } catch (err) {
    console.error("[api/proposals/init-status] failed to read multisig on-chain:", err);
    return NextResponse.json({ error: "Could not read multisig on-chain." }, { status: 502 });
  }

  // 2. Scan transaction indexes from stale+1 to current for pending proposals
  const connection = serverConnection();
  let hasPendingInit = false;
  let pendingTxIndex: string | null = null;
  let pendingProposalPda: string | null = null;

  const getProposalPdaArgs: {
    multisigPda: PublicKey;
    transactionIndex: bigint;
    programId?: PublicKey;
  } = {
    multisigPda,
    transactionIndex: 0n, // placeholder, overwritten in loop
  };
  if (SQUADS_PROGRAM_ID) {
    getProposalPdaArgs.programId = new PublicKey(SQUADS_PROGRAM_ID);
  }

  for (let i = onChainStaleTxIndex + 1n; i <= onChainTxIndex; i++) {
    try {
      getProposalPdaArgs.transactionIndex = i;
      const [proposalPda] = multisig.getProposalPda(getProposalPdaArgs);

      const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);

      if (PENDING_KINDS.has(proposal.status.__kind)) {
        hasPendingInit = true;
        pendingTxIndex = i.toString();
        pendingProposalPda = proposalPda.toBase58();
        break; // first pending is enough
      }
    } catch {
      // Proposal account doesn't exist for this index — skip
    }
  }

  // 3. Also check DB for unarchived drafts (supplementary signal)
  let dbDraftCount = 0;
  if (isPrismaAvailable()) {
    try {
      dbDraftCount = await prisma.proposalDraft.count({
        where: { cofreAddress: multisigAddress, archivedAt: { equals: null } },
      });
    } catch {
      // DB unavailable — ignore
    }
  }

  const response: InitStatusResponse = {
    hasPendingInit,
    pendingTxIndex,
    pendingProposalPda,
    onChainTransactionIndex: onChainTxIndex.toString(),
    onChainStaleTransactionIndex: onChainStaleTxIndex.toString(),
    dbDraftCount,
  };

  return NextResponse.json(response);
}

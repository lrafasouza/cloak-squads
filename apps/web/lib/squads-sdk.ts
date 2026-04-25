"use client";

import { buildIssueLicenseProposal } from "@cloak-squads/core/squads-adapter";
import type { Connection, PublicKey, SendOptions, Signer, TransactionInstruction } from "@solana/web3.js";
import { Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

export type BrowserSquadsWallet = {
  publicKey: PublicKey | null;
  sendTransaction?: (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: SendOptions,
  ) => Promise<string>;
};

export function assertBrowserSquadsWallet(
  wallet: BrowserSquadsWallet,
): asserts wallet is BrowserSquadsWallet & {
  publicKey: PublicKey;
  sendTransaction: NonNullable<BrowserSquadsWallet["sendTransaction"]>;
} {
  if (!wallet.publicKey) {
    throw new Error("Connect a Squads member wallet.");
  }
  if (typeof wallet.sendTransaction !== "function") {
    throw new Error("Wallet sendTransaction is required for Squads browser flow.");
  }
}

export async function nextTransactionIndex(connection: Connection, multisigPda: PublicKey) {
  const account = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  return BigInt(account.transactionIndex.toString()) + 1n;
}

export async function createIssueLicenseProposalWithSigner(params: {
  connection: Connection;
  multisigPda: PublicKey;
  creator: Signer;
  issueLicenseIx: TransactionInstruction;
}) {
  return buildIssueLicenseProposal(params);
}

export async function createIssueLicenseProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  issueLicenseIx: TransactionInstruction;
  memo?: string;
}) {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);
  const [vaultPda] = multisig.getVaultPda({ multisigPda: params.multisigPda, index: 0 });
  const latestBlockhash = await params.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [params.issueLicenseIx],
  });

  const createVaultIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: params.memo ?? "issue license",
  });
  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  const tx = new Transaction().add(createVaultIx, createProposalIx);
  tx.feePayer = params.wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  try {
    const sim = await params.connection.simulateTransaction(tx, undefined, true);
    console.log("[squads-sdk] simulate result:", sim);
    if (sim.value.err) {
      console.error("[squads-sdk] simulate error:", sim.value.err);
      console.error("[squads-sdk] simulate logs:", sim.value.logs);
      throw new Error(
        `Simulation failed: ${JSON.stringify(sim.value.err)} | logs: ${(sim.value.logs ?? []).join(" || ")}`,
      );
    }
  } catch (simErr) {
    console.error("[squads-sdk] simulate threw:", simErr);
    throw simErr;
  }

  let signature: string;
  try {
    signature = await params.wallet.sendTransaction(tx, params.connection);
  } catch (sendErr) {
    console.error("[squads-sdk] sendTransaction error:", sendErr);
    if (sendErr && typeof sendErr === "object") {
      const anyErr = sendErr as { logs?: unknown; cause?: unknown; message?: unknown };
      console.error("[squads-sdk]   .logs:", anyErr.logs);
      console.error("[squads-sdk]   .cause:", anyErr.cause);
      console.error("[squads-sdk]   .message:", anyErr.message);
    }
    throw sendErr;
  }
  const [vaultTransactionPda] = multisig.getTransactionPda({
    multisigPda: params.multisigPda,
    index: transactionIndex,
  });

  return { signature, transactionIndex, vaultTransactionPda };
}

export async function proposalApprove(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  transactionIndex: bigint;
  memo?: string;
}) {
  assertBrowserSquadsWallet(params.wallet);
  const approveParams: Parameters<typeof multisig.instructions.proposalApprove>[0] = {
    multisigPda: params.multisigPda,
    transactionIndex: params.transactionIndex,
    member: params.wallet.publicKey,
  };
  if (params.memo) approveParams.memo = params.memo;
  const ix = multisig.instructions.proposalApprove(approveParams);
  return sendSingleInstruction(params.connection, params.wallet, ix);
}

export async function proposalReject(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  transactionIndex: bigint;
  memo?: string;
}) {
  assertBrowserSquadsWallet(params.wallet);
  const rejectParams: Parameters<typeof multisig.instructions.proposalReject>[0] = {
    multisigPda: params.multisigPda,
    transactionIndex: params.transactionIndex,
    member: params.wallet.publicKey,
  };
  if (params.memo) rejectParams.memo = params.memo;
  const ix = multisig.instructions.proposalReject(rejectParams);
  return sendSingleInstruction(params.connection, params.wallet, ix);
}

export async function vaultTransactionExecute(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  transactionIndex: bigint;
}) {
  assertBrowserSquadsWallet(params.wallet);
  const { instruction, lookupTableAccounts } = await multisig.instructions.vaultTransactionExecute({
    connection: params.connection,
    multisigPda: params.multisigPda,
    transactionIndex: params.transactionIndex,
    member: params.wallet.publicKey,
  });
  const latestBlockhash = await params.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: params.wallet.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [instruction],
  }).compileToV0Message(lookupTableAccounts);
  return params.wallet.sendTransaction(new VersionedTransaction(message), params.connection);
}

async function sendSingleInstruction(
  connection: Connection,
  wallet: BrowserSquadsWallet & {
    publicKey: PublicKey;
    sendTransaction: NonNullable<BrowserSquadsWallet["sendTransaction"]>;
  },
  instruction: TransactionInstruction,
) {
  const latestBlockhash = await connection.getLatestBlockhash();
  const tx = new Transaction().add(instruction);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;
  return wallet.sendTransaction(tx, connection);
}

"use client";

import { translateOnchainError } from "@cloak-squads/core/onchain-error";
import type { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Transaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { Period } from "@sqds/multisig/lib/generated/types/Period";
import { simulateAndOptimize } from "@/lib/tx-optimization";
import { assertBrowserSquadsWallet, nextTransactionIndex, type BrowserSquadsWallet } from "@/lib/squads-sdk";

export { Period };

export async function createAddSpendingLimitProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  createKey: PublicKey;
  vaultIndex: number;
  mint: PublicKey;
  amount: bigint;
  period: Period;
  members: PublicKey[];
  destinations: PublicKey[];
  memo?: string;
}): Promise<{ signature: string; transactionIndex: bigint; spendingLimitPda: PublicKey }> {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);
  const [spendingLimitPda] = multisig.getSpendingLimitPda({
    multisigPda: params.multisigPda,
    createKey: params.createKey,
  });

  const configIx = multisig.instructions.configTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    actions: [
      {
        __kind: "AddSpendingLimit",
        createKey: params.createKey,
        vaultIndex: params.vaultIndex,
        mint: params.mint,
        amount: params.amount,
        period: params.period,
        members: params.members,
        destinations: params.destinations,
        memo: params.memo ?? null,
      },
    ],
    memo: params.memo ?? "Add spending limit",
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  const latestBlockhash = await params.connection.getLatestBlockhash();
  const { budgetIxs } = await simulateAndOptimize({
    connection: params.connection,
    instructions: [configIx, proposalIx],
    payer: params.wallet.publicKey,
  });
  const tx = new Transaction().add(...budgetIxs, configIx, proposalIx);
  tx.feePayer = params.wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  let signature: string;
  try {
    signature = await params.wallet.sendTransaction(tx, params.connection);
  } catch (sendErr) {
    throw new Error(translateOnchainError(sendErr));
  }

  const { blockhash, lastValidBlockHeight } = await params.connection.getLatestBlockhash();
  await params.connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return { signature, transactionIndex, spendingLimitPda };
}

export async function createRemoveSpendingLimitProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  spendingLimitPda: PublicKey;
  memo?: string;
}): Promise<{ signature: string; transactionIndex: bigint }> {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);

  const configIx = multisig.instructions.configTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    actions: [
      {
        __kind: "RemoveSpendingLimit",
        spendingLimit: params.spendingLimitPda,
        memo: params.memo ?? null,
      },
    ],
    memo: params.memo ?? "Remove spending limit",
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  const latestBlockhash = await params.connection.getLatestBlockhash();
  const { budgetIxs } = await simulateAndOptimize({
    connection: params.connection,
    instructions: [configIx, proposalIx],
    payer: params.wallet.publicKey,
  });
  const tx = new Transaction().add(...budgetIxs, configIx, proposalIx);
  tx.feePayer = params.wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  let signature: string;
  try {
    signature = await params.wallet.sendTransaction(tx, params.connection);
  } catch (sendErr) {
    throw new Error(translateOnchainError(sendErr));
  }

  const { blockhash, lastValidBlockHeight } = await params.connection.getLatestBlockhash();
  await params.connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return { signature, transactionIndex };
}

export function buildSpendingLimitUseIx(params: {
  multisigPda: PublicKey;
  member: PublicKey;
  spendingLimitPda: PublicKey;
  vaultPda: PublicKey;
  destination: PublicKey;
  amount: bigint;
  decimals: number;
  memo?: string;
}): TransactionInstruction {
  return multisig.instructions.spendingLimitUse({
    multisigPda: params.multisigPda,
    member: params.member,
    spendingLimit: params.spendingLimitPda,
    vault: params.vaultPda,
    destination: params.destination,
    args: {
      amount: params.amount,
      decimals: params.decimals,
      memo: params.memo ?? null,
    },
  });
}

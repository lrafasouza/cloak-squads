"use client";

import { translateOnchainError } from "@cloak-squads/core/onchain-error";
import { buildIssueLicenseProposal } from "@cloak-squads/core/squads-adapter";
import type {
  Connection,
  PublicKey,
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import { Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { simulateAndOptimize } from "@/lib/tx-optimization";

const IS_DEV = process.env.NODE_ENV === "development";

function log(...args: unknown[]) {
  if (IS_DEV) console.log(...args);
}

function logError(...args: unknown[]) {
  if (IS_DEV) console.error(...args);
}

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

export async function createInitCofreProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  initCofreIx: TransactionInstruction;
  memo?: string;
}) {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);
  const [vaultPda] = multisig.getVaultPda({ multisigPda: params.multisigPda, index: 0 });
  const latestBlockhash = await params.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [params.initCofreIx],
  });

  const createVaultIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: params.memo ?? "init cofre",
  });
  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  const coreIxs = [createVaultIx, createProposalIx];
  const { budgetIxs } = await simulateAndOptimize({
    connection: params.connection,
    instructions: coreIxs,
    payer: params.wallet.publicKey,
    writableAccounts: [params.multisigPda],
  });

  const tx = new Transaction().add(...budgetIxs, ...coreIxs);
  tx.feePayer = params.wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  const signature = await params.wallet.sendTransaction(tx, params.connection);
  const { blockhash: confirmBh, lastValidBlockHeight } =
    await params.connection.getLatestBlockhash();
  await params.connection.confirmTransaction(
    { signature, blockhash: confirmBh, lastValidBlockHeight },
    "confirmed",
  );

  const [vaultTransactionPda] = multisig.getTransactionPda({
    multisigPda: params.multisigPda,
    index: transactionIndex,
  });

  return { signature, transactionIndex, vaultTransactionPda };
}

export async function createIssueLicenseProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  issueLicenseIx: TransactionInstruction;
  memo?: string;
}) {
  return createVaultProposal({
    ...params,
    instructions: [params.issueLicenseIx],
    memo: params.memo ?? "issue license",
  });
}

export async function createVaultProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  instructions: TransactionInstruction[];
  memo?: string;
}) {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);
  const [vaultPda] = multisig.getVaultPda({ multisigPda: params.multisigPda, index: 0 });
  const latestBlockhash = await params.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: params.instructions,
  });

  const createVaultIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: params.memo ?? "vault transaction",
  });
  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  const coreIxs = [createVaultIx, createProposalIx];
  const { budgetIxs, simulationErr, logs: simLogs } = await simulateAndOptimize({
    connection: params.connection,
    instructions: coreIxs,
    payer: params.wallet.publicKey,
    writableAccounts: [params.multisigPda],
  });

  // Surface real on-chain errors, but tolerate sim-only artifacts (no signers,
  // expired blockhash) so we don't block legitimate vault TXs.
  if (simulationErr && params.instructions.length === 1) {
    const errStr = JSON.stringify(simulationErr);
    const tolerated =
      errStr.includes("BlockhashNotFound") ||
      errStr.includes("signature verification") ||
      errStr.includes("AccountNotFound");
    if (!tolerated) {
      const raw = `${errStr}\n${simLogs.join("\n")}`.trim();
      throw new Error(translateOnchainError(raw));
    }
    log("[squads-sdk] simulation produced tolerated error, proceeding:", errStr);
  }

  const tx = new Transaction().add(...budgetIxs, ...coreIxs);
  tx.feePayer = params.wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  let signature: string;
  try {
    signature = await params.wallet.sendTransaction(tx, params.connection);
  } catch (sendErr) {
    logError("[squads-sdk] sendTransaction error:", sendErr);
    if (sendErr && typeof sendErr === "object") {
      const anyErr = sendErr as { logs?: unknown; cause?: unknown; message?: unknown };
      logError("[squads-sdk]   .logs:", anyErr.logs);
      logError("[squads-sdk]   .cause:", anyErr.cause);
      logError("[squads-sdk]   .message:", anyErr.message);
    }
    throw new Error(translateOnchainError(sendErr));
  }

  log("[squads-sdk] awaiting confirmation:", signature);
  const { blockhash: confirmBh, lastValidBlockHeight } =
    await params.connection.getLatestBlockhash();
  await params.connection.confirmTransaction(
    { signature, blockhash: confirmBh, lastValidBlockHeight },
    "confirmed",
  );
  log("[squads-sdk] confirmed:", signature);

  const [vaultTransactionPda] = multisig.getTransactionPda({
    multisigPda: params.multisigPda,
    index: transactionIndex,
  });

  return { signature, transactionIndex, vaultTransactionPda };
}

export async function createBatchIssueLicenseProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  issueLicenseIxs: TransactionInstruction[];
  memo?: string;
}) {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);
  const [vaultPda] = multisig.getVaultPda({ multisigPda: params.multisigPda, index: 0 });
  const latestBlockhash = await params.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: params.issueLicenseIxs,
  });

  const createVaultIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: params.memo ?? `issue license batch (${params.issueLicenseIxs.length} recipients)`,
  });
  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  const coreIxs = [createVaultIx, createProposalIx];
  const { budgetIxs } = await simulateAndOptimize({
    connection: params.connection,
    instructions: coreIxs,
    payer: params.wallet.publicKey,
    writableAccounts: [params.multisigPda],
  });

  const tx = new Transaction().add(...budgetIxs, ...coreIxs);
  tx.feePayer = params.wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  let signature: string;
  try {
    signature = await params.wallet.sendTransaction(tx, params.connection);
  } catch (sendErr) {
    logError("[squads-sdk] batch sendTransaction error:", sendErr);
    throw new Error(translateOnchainError(sendErr));
  }

  log("[squads-sdk] batch awaiting confirmation:", signature);
  const { blockhash: confirmBh, lastValidBlockHeight } =
    await params.connection.getLatestBlockhash();
  await params.connection.confirmTransaction(
    { signature, blockhash: confirmBh, lastValidBlockHeight },
    "confirmed",
  );
  log("[squads-sdk] batch confirmed:", signature);

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
  return sendSingleInstruction(params.connection, params.wallet, ix, "proposalApprove");
}

// ── TICKET #15b: Multisig info helper (read-only on-chain) ──────────────

export type MultisigMember = {
  publicKey: string;
  permissions: {
    initiate: boolean;
    vote: boolean;
    execute: boolean;
  };
};

export type MultisigInfo = {
  threshold: number;
  timeLock: number;
  members: MultisigMember[];
  transactionIndex: string;
  staleTransactionIndex: string;
};

export async function loadMultisigInfo(args: {
  connection: Connection;
  multisigPda: PublicKey;
}): Promise<MultisigInfo> {
  const { connection, multisigPda } = args;
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);

  return {
    threshold: ms.threshold,
    timeLock: ms.timeLock,
    transactionIndex: ms.transactionIndex.toString(),
    staleTransactionIndex: ms.staleTransactionIndex.toString(),
    members: ms.members.map((m) => ({
      publicKey: m.key.toBase58(),
      permissions: {
        initiate: (m.permissions.mask & 1) !== 0,
        vote: (m.permissions.mask & 2) !== 0,
        execute: (m.permissions.mask & 4) !== 0,
      },
    })),
  };
}

// ── TICKET #13a: proposalCancel wrapper (on-chain) ─────────────────────

export async function proposalCancel(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  transactionIndex: bigint;
  memo?: string;
}) {
  assertBrowserSquadsWallet(params.wallet);
  const cancelParams: Parameters<typeof multisig.instructions.proposalCancel>[0] = {
    multisigPda: params.multisigPda,
    transactionIndex: params.transactionIndex,
    member: params.wallet.publicKey,
  };
  if (params.memo) cancelParams.memo = params.memo;
  const ix = multisig.instructions.proposalCancel(cancelParams);
  return sendSingleInstruction(params.connection, params.wallet, ix, "proposalCancel");
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
  return sendSingleInstruction(params.connection, params.wallet, ix, "proposalReject");
}

export async function vaultTransactionExecute(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  transactionIndex: bigint;
}) {
  assertBrowserSquadsWallet(params.wallet);
  log("[squads-sdk] vaultTransactionExecute start", {
    multisig: params.multisigPda.toBase58(),
    transactionIndex: params.transactionIndex.toString(),
    member: params.wallet.publicKey.toBase58(),
  });

  const proposalPda = multisig.getProposalPda({
    multisigPda: params.multisigPda,
    transactionIndex: params.transactionIndex,
  })[0];
  try {
    const proposal = await multisig.accounts.Proposal.fromAccountAddress(
      params.connection,
      proposalPda,
    );
    log("[squads-sdk] proposal status:", proposal.status, "approved:", proposal.approved.length);
  } catch (err) {
    logError("[squads-sdk] could not load proposal — was it created?", err);
    throw new Error("Proposal not found on-chain. Did you create + approve it before executing?");
  }

  const { instruction, lookupTableAccounts } = await multisig.instructions.vaultTransactionExecute({
    connection: params.connection,
    multisigPda: params.multisigPda,
    transactionIndex: params.transactionIndex,
    member: params.wallet.publicKey,
  });
  const latestBlockhash = await params.connection.getLatestBlockhash();

  // Single simulation: builds budget ixs AND surfaces on-chain errors. Wallet adapters
  // often swallow these errors, so we must throw on real failures here.
  const { budgetIxs, simulationErr, logs: simLogs } = await simulateAndOptimize({
    connection: params.connection,
    instructions: [instruction],
    payer: params.wallet.publicKey,
    writableAccounts: [params.multisigPda],
    lookupTableAccounts,
  });
  if (simulationErr) {
    const raw = `${JSON.stringify(simulationErr)}\n${simLogs.join("\n")}`.trim();
    throw new Error(translateOnchainError(raw));
  }

  const message = new TransactionMessage({
    payerKey: params.wallet.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [...budgetIxs, instruction],
  }).compileToV0Message(lookupTableAccounts);
  const versionedTx = new VersionedTransaction(message);

  try {
    const signature = await params.wallet.sendTransaction(versionedTx, params.connection);
    const { blockhash: confirmBh, lastValidBlockHeight } =
      await params.connection.getLatestBlockhash();
    await params.connection.confirmTransaction(
      { signature, blockhash: confirmBh, lastValidBlockHeight },
      "confirmed",
    );
    return signature;
  } catch (sendErr) {
    logError("[squads-sdk] execute sendTransaction error:", sendErr);
    if (sendErr && typeof sendErr === "object") {
      const anyErr = sendErr as { logs?: unknown; cause?: unknown; message?: unknown };
      logError("[squads-sdk]   .logs:", anyErr.logs);
      logError("[squads-sdk]   .cause:", anyErr.cause);
      logError("[squads-sdk]   .message:", anyErr.message);
    }
    throw new Error(translateOnchainError(sendErr));
  }
}

export async function configTransactionExecute(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  transactionIndex: bigint;
}) {
  assertBrowserSquadsWallet(params.wallet);
  log("[squads-sdk] configTransactionExecute start", {
    multisig: params.multisigPda.toBase58(),
    transactionIndex: params.transactionIndex.toString(),
    member: params.wallet.publicKey.toBase58(),
  });

  const proposalPda = multisig.getProposalPda({
    multisigPda: params.multisigPda,
    transactionIndex: params.transactionIndex,
  })[0];
  try {
    const proposal = await multisig.accounts.Proposal.fromAccountAddress(
      params.connection,
      proposalPda,
    );
    log("[squads-sdk] proposal status:", proposal.status, "approved:", proposal.approved.length);
  } catch (err) {
    logError("[squads-sdk] could not load proposal — was it created?", err);
    throw new Error("Proposal not found on-chain. Did you create + approve it before executing?");
  }

  const instruction = multisig.instructions.configTransactionExecute({
    multisigPda: params.multisigPda,
    transactionIndex: params.transactionIndex,
    member: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    spendingLimits: [],
  });
  const latestBlockhash = await params.connection.getLatestBlockhash();

  // Single simulation: builds budget ixs AND surfaces on-chain errors.
  const { budgetIxs, simulationErr, logs: simLogs } = await simulateAndOptimize({
    connection: params.connection,
    instructions: [instruction],
    payer: params.wallet.publicKey,
    writableAccounts: [params.multisigPda],
  });
  if (simulationErr) {
    const raw = `${JSON.stringify(simulationErr)}\n${simLogs.join("\n")}`.trim();
    throw new Error(translateOnchainError(raw));
  }

  const tx = new Transaction().add(...budgetIxs, instruction);
  tx.feePayer = params.wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  try {
    const signature = await params.wallet.sendTransaction(tx, params.connection);
    const { blockhash: confirmBh, lastValidBlockHeight } =
      await params.connection.getLatestBlockhash();
    await params.connection.confirmTransaction(
      { signature, blockhash: confirmBh, lastValidBlockHeight },
      "confirmed",
    );
    return signature;
  } catch (sendErr) {
    logError("[squads-sdk] config execute sendTransaction error:", sendErr);
    throw new Error(translateOnchainError(sendErr));
  }
}

export async function detectTransactionType(
  connection: Connection,
  multisigPda: PublicKey,
  transactionIndex: bigint,
): Promise<"config" | "vault" | null> {
  const [transactionPda] = multisig.getTransactionPda({
    multisigPda,
    index: transactionIndex,
  });
  try {
    await multisig.accounts.ConfigTransaction.fromAccountAddress(connection, transactionPda);
    return "config";
  } catch {
    try {
      await multisig.accounts.VaultTransaction.fromAccountAddress(connection, transactionPda);
      return "vault";
    } catch {
      return null;
    }
  }
}

// ── Config proposals (add member, remove member, change threshold) ──────────

export async function createAddMemberProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  newMember: PublicKey;
  memo?: string;
}): Promise<{ signature: string; transactionIndex: bigint }> {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);

  const memberPerms = multisig.types.Permissions.fromPermissions([
    multisig.types.Permission.Initiate,
    multisig.types.Permission.Vote,
    multisig.types.Permission.Execute,
  ]);

  const configIx = multisig.instructions.configTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    actions: [
      {
        __kind: "AddMember",
        newMember: { key: params.newMember, permissions: memberPerms },
      },
    ],
    memo: params.memo ?? "Add member",
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  return sendConfigTransaction(
    params.connection,
    params.wallet,
    [configIx, proposalIx],
    transactionIndex,
  );
}

export async function createRemoveMemberProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  memberToRemove: PublicKey;
  memo?: string;
}): Promise<{ signature: string; transactionIndex: bigint }> {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);

  const configIx = multisig.instructions.configTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    actions: [{ __kind: "RemoveMember", oldMember: params.memberToRemove }],
    memo: params.memo ?? "Remove member",
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  return sendConfigTransaction(
    params.connection,
    params.wallet,
    [configIx, proposalIx],
    transactionIndex,
  );
}

export async function createChangeThresholdProposal(params: {
  connection: Connection;
  wallet: BrowserSquadsWallet;
  multisigPda: PublicKey;
  newThreshold: number;
  memo?: string;
}): Promise<{ signature: string; transactionIndex: bigint }> {
  assertBrowserSquadsWallet(params.wallet);
  const transactionIndex = await nextTransactionIndex(params.connection, params.multisigPda);

  const configIx = multisig.instructions.configTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.wallet.publicKey,
    actions: [{ __kind: "ChangeThreshold", newThreshold: params.newThreshold }],
    memo: params.memo ?? `Change threshold to ${params.newThreshold}`,
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    creator: params.wallet.publicKey,
    rentPayer: params.wallet.publicKey,
    transactionIndex,
  });

  return sendConfigTransaction(
    params.connection,
    params.wallet,
    [configIx, proposalIx],
    transactionIndex,
  );
}

async function sendConfigTransaction(
  connection: Connection,
  wallet: BrowserSquadsWallet & {
    publicKey: PublicKey;
    sendTransaction: NonNullable<BrowserSquadsWallet["sendTransaction"]>;
  },
  instructions: TransactionInstruction[],
  transactionIndex: bigint,
): Promise<{ signature: string; transactionIndex: bigint }> {
  const latestBlockhash = await connection.getLatestBlockhash();
  const { budgetIxs } = await simulateAndOptimize({
    connection,
    instructions,
    payer: wallet.publicKey,
  });
  const tx = new Transaction().add(...budgetIxs, ...instructions);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  let signature: string;
  try {
    signature = await wallet.sendTransaction(tx, connection);
  } catch (sendErr) {
    logError("[squads-sdk] config sendTransaction error:", sendErr);
    throw new Error(translateOnchainError(sendErr));
  }

  const { blockhash: confirmBh, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, blockhash: confirmBh, lastValidBlockHeight },
    "confirmed",
  );
  return { signature, transactionIndex };
}

async function sendSingleInstruction(
  connection: Connection,
  wallet: BrowserSquadsWallet & {
    publicKey: PublicKey;
    sendTransaction: NonNullable<BrowserSquadsWallet["sendTransaction"]>;
  },
  instruction: TransactionInstruction,
  label = "sendSingleInstruction",
) {
  const latestBlockhash = await connection.getLatestBlockhash();
  const { budgetIxs } = await simulateAndOptimize({
    connection,
    instructions: [instruction],
    payer: wallet.publicKey,
  });
  const tx = new Transaction().add(...budgetIxs, instruction);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;

  try {
    const signature = await wallet.sendTransaction(tx, connection);
    const { blockhash: confirmBh, lastValidBlockHeight } = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature, blockhash: confirmBh, lastValidBlockHeight },
      "confirmed",
    );
    return signature;
  } catch (sendErr) {
    logError(`[squads-sdk] ${label} sendTransaction error:`, sendErr);
    if (sendErr && typeof sendErr === "object") {
      const anyErr = sendErr as { logs?: unknown; cause?: unknown; message?: unknown };
      logError("[squads-sdk]   .logs:", anyErr.logs);
      logError("[squads-sdk]   .cause:", anyErr.cause);
      logError("[squads-sdk]   .message:", anyErr.message);
    }
    throw new Error(translateOnchainError(sendErr));
  }
}

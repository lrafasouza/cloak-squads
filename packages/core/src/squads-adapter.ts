import {
  type Connection,
  type PublicKey,
  type Signer,
  type TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

export async function buildIssueLicenseProposal(params: {
  connection: Connection;
  multisigPda: PublicKey;
  creator: Signer;
  issueLicenseIx: TransactionInstruction;
}): Promise<{
  transactionIndex: bigint;
  vaultTransactionPda: PublicKey;
  signature: string;
}> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    params.connection,
    params.multisigPda,
  );
  const newTxIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  const [vaultPda] = multisig.getVaultPda({
    multisigPda: params.multisigPda,
    index: 0,
  });

  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await params.connection.getLatestBlockhash()).blockhash,
    instructions: [params.issueLicenseIx],
  });

  const vaultSig = await multisig.rpc.vaultTransactionCreate({
    connection: params.connection,
    feePayer: params.creator,
    multisigPda: params.multisigPda,
    transactionIndex: newTxIndex,
    creator: params.creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "issue license",
  });
  await params.connection.confirmTransaction(vaultSig, "confirmed");

  const signature = await multisig.rpc.proposalCreate({
    connection: params.connection,
    feePayer: params.creator,
    creator: params.creator,
    multisigPda: params.multisigPda,
    transactionIndex: newTxIndex,
  });

  const [vaultTransactionPda] = multisig.getTransactionPda({
    multisigPda: params.multisigPda,
    index: newTxIndex,
  });

  return { transactionIndex: newTxIndex, vaultTransactionPda, signature };
}

import type { Instruction, TransactionMessage } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { computePayloadHash, u64ToLeBytes, encodeArray, encodePubkey } from "./encoding";
import type { PayloadInvariants } from "./types";

export async function buildIssueLicenseProposal(params: {
  connection: any,
  multisigPda: PublicKey,
  creator: PublicKey,
  issueLicenseIx: Instruction,
}): Promise<{ transactionIndex: bigint; vaultTransactionPda: PublicKey }> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    params.connection,
    multisigPda,
  );
  const newTxIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await params.connection.getLatestBlockhash()).blockhash,
    instructions: [params.issueLicenseIx],
  });

  const createTx = await multisig.rpc.vaultTransactionCreate({
    connection: params.connection,
    feePayer: params.creator,
    multisigPda,
    transactionIndex: newTxIndex,
    creator: params.creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "issue license",
  });

  const [vaultTransactionPda] = multisig.getTransactionPda({
    multisigPda,
    index: newTxIndex,
  });

  return { transactionIndex: newTxIndex, vaultTransactionPda };
}

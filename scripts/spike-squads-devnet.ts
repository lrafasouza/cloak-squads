import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const { Permission, Permissions } = multisig.types;
const { Multisig } = multisig.accounts;

function loadKeypair(filePath = path.join(os.homedir(), ".config/solana/id.json")) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Keypair not found at ${filePath}; using an ephemeral devnet keypair.`);
    return Keypair.generate();
  }

  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[]),
  );
}

async function confirm(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function requestAirdropWithRetry(connection: Connection, recipient: PublicKey, sol: number) {
  let lastError: unknown;
  const amounts = Array.from(new Set([sol, 1, 0.5, 0.25]));

  for (const amount of amounts) {
    try {
      const signature = await connection.requestAirdrop(recipient, amount * LAMPORTS_PER_SOL);
      await confirm(connection, signature);
      return signature;
    } catch (error) {
      lastError = error;
      console.warn(`Airdrop ${amount} SOL failed; trying smaller amount.`);
    }
  }

  throw lastError;
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const creator = loadKeypair(process.env.SOLANA_KEYPAIR);
  const memberTwo = Keypair.generate();
  const memberThree = Keypair.generate();
  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  console.log("Creator:", creator.publicKey.toBase58());
  console.log("Multisig PDA:", multisigPda.toBase58());
  console.log("Vault PDA:", vaultPda.toBase58());

  const airdrop = await requestAirdropWithRetry(connection, creator.publicKey, 1);
  console.log("Airdrop:", airdrop);

  const treasury = PublicKey.default;
  const memberPermissions = Permissions.fromPermissions([
    Permission.Initiate,
    Permission.Vote,
    Permission.Execute,
  ]);

  const createSig = await multisig.rpc.multisigCreateV2({
    connection,
    treasury,
    createKey,
    creator,
    multisigPda,
    configAuthority: null,
    threshold: 2,
    members: [
      { key: creator.publicKey, permissions: memberPermissions },
      { key: memberTwo.publicKey, permissions: memberPermissions },
      { key: memberThree.publicKey, permissions: memberPermissions },
    ],
    timeLock: 0,
    rentCollector: null,
    memo: "cloak-squads phase0 spike",
  });
  await confirm(connection, createSig);
  console.log("multisigCreateV2:", createSig);

  const fundVaultSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: vaultPda,
        lamports: 10_000_000,
      }),
    ),
    [creator],
    { commitment: "confirmed" },
  );
  console.log("fundVault:", fundVaultSig);

  const multisigAccount = await Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  const transferIx = SystemProgram.transfer({
    fromPubkey: vaultPda,
    toPubkey: creator.publicKey,
    lamports: 1_000_000,
  });
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [transferIx],
  });

  const createTxSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "phase0 vault signer spike",
  });
  await confirm(connection, createTxSig);
  console.log("vaultTransactionCreate:", createTxSig);

  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: creator,
    creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, proposalSig);
  console.log("proposalCreate:", proposalSig);

  const approveOneSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: creator,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, approveOneSig);
  console.log("proposalApprove creator:", approveOneSig);

  const approveTwoSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: creator,
    member: memberTwo,
    multisigPda,
    transactionIndex,
  });
  await confirm(connection, approveTwoSig);
  console.log("proposalApprove memberTwo:", approveTwoSig);

  const executeSig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: creator,
    multisigPda,
    transactionIndex,
    member: creator.publicKey,
  });
  await confirm(connection, executeSig);
  console.log("vaultTransactionExecute:", executeSig);

  const executed = await connection.getTransaction(executeSig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  console.log(
    JSON.stringify(
      {
        executeSig,
        vaultPda: vaultPda.toBase58(),
        innerInstructions: executed?.meta?.innerInstructions ?? [],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

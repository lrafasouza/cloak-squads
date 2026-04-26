import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  generateNote,
  getShieldPoolPDAs,
  hexToBytes,
} from "@cloak.dev/sdk-devnet";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

function loadKeypair(filePath = path.join(os.homedir(), ".config/solana/id.json")) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[]),
  );
}

function buildDepositIx(
  variant: "v4-no-treasury" | "v5-with-treasury" | "v5-with-vault" | "v6-treasury-vault",
  payer: Keypair,
  pool: any,
  merkleTree: any,
  treasury: any,
  vaultAuthority: any,
  amount: number,
  commitment: Uint8Array,
) {
  const data = new Uint8Array(41);
  data[0] = 1; // legacy deposit discriminator
  new DataView(data.buffer).setBigUint64(1, BigInt(amount), true);
  data.set(commitment, 9);

  const baseKeys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: merkleTree, isSigner: false, isWritable: true },
  ];
  let keys = baseKeys;
  if (variant === "v5-with-treasury") {
    keys = [...baseKeys, { pubkey: treasury, isSigner: false, isWritable: true }];
  } else if (variant === "v5-with-vault") {
    keys = [...baseKeys, { pubkey: vaultAuthority, isSigner: false, isWritable: false }];
  } else if (variant === "v6-treasury-vault") {
    keys = [
      ...baseKeys,
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    ];
  }
  return new TransactionInstruction({
    programId: CLOAK_PROGRAM_ID,
    keys,
    data: Buffer.from(data),
  });
}

async function trySimulate(
  connection: Connection,
  payer: Keypair,
  ix: TransactionInstruction,
  label: string,
) {
  const cuLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 });
  const cuPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 });
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash })
    .add(cuLimit)
    .add(cuPrice)
    .add(ix);
  tx.sign(payer);
  const sim = await connection.simulateTransaction(tx);
  console.log(`\n--- ${label} ---`);
  console.log("  err:", JSON.stringify(sim.value.err));
  console.log("  logs (last 6):");
  for (const l of (sim.value.logs ?? []).slice(-6)) console.log("   ", l);
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = loadKeypair(process.env.SOLANA_KEYPAIR);
  const { pool, merkleTree, treasury, vaultAuthority } = getShieldPoolPDAs(
    CLOAK_PROGRAM_ID,
    NATIVE_SOL_MINT,
  );

  const note = await generateNote(50_000_000, "devnet");
  const commitment = hexToBytes(note.commitment);

  for (const v of ["v4-no-treasury", "v5-with-treasury", "v5-with-vault", "v6-treasury-vault"] as const) {
    const ix = buildDepositIx(v, payer, pool, merkleTree, treasury, vaultAuthority, 50_000_000, commitment);
    await trySimulate(connection, payer, ix, v);
  }

  // Probe discriminator 0 (transact) with junk proof+publicInputs
  const dummyProof = new Uint8Array(256);
  const dummyPublic = new Uint8Array(32);
  const transactData = new Uint8Array(1 + dummyProof.length + dummyPublic.length);
  transactData[0] = 0;
  transactData.set(dummyProof, 1);
  transactData.set(dummyPublic, 1 + dummyProof.length);

  const nullifier0 = new Uint8Array(32);
  const nullifier1 = new Uint8Array(32).fill(1);
  const [n0pda] = await import("@solana/web3.js").then((web3) =>
    web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifier"), pool.toBuffer(), Buffer.from(nullifier0)],
      CLOAK_PROGRAM_ID,
    ),
  );
  const [n1pda] = await import("@solana/web3.js").then((web3) =>
    web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifier"), pool.toBuffer(), Buffer.from(nullifier1)],
      CLOAK_PROGRAM_ID,
    ),
  );

  const transactIx = new TransactionInstruction({
    programId: CLOAK_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: merkleTree, isSigner: false, isWritable: true },
      { pubkey: n0pda, isSigner: false, isWritable: true },
      { pubkey: n1pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(transactData),
  });
  await trySimulate(connection, payer, transactIx, "v7-transact-disc0-junk-proof");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

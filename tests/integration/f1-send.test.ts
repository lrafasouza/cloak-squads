import assert from "node:assert/strict";
import path from "node:path";
import { Keypair, type PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import bankrun from "anchor-bankrun";
import {
  type BankrunContext,
  GATEKEEPER_PROGRAM_ID,
  type PayloadInvariants,
  SQUADS_HARNESS_PROGRAM_ID,
  buildIxData,
  cofrePda,
  computePayloadHash,
  decodeLicense,
  encodeArray,
  encodeI64,
  encodePubkey,
  encodeU64,
  fundedSystemAccount,
  licensePda,
  processTx,
  squadsVaultPda,
} from "./helpers/gatekeeper.ts";

const { startAnchor } = bankrun;
const ROOT = path.resolve(process.cwd());

function repeated(length: number, value: number) {
  return new Uint8Array(length).fill(value);
}

function harnessIx(name: string, keys: TransactionInstruction["keys"], fields: Buffer[]) {
  return new TransactionInstruction({
    programId: SQUADS_HARNESS_PROGRAM_ID,
    keys,
    data: buildIxData(name, fields),
  });
}

function gatekeeperIx(name: string, keys: TransactionInstruction["keys"], fields: Buffer[]) {
  return new TransactionInstruction({
    programId: GATEKEEPER_PROGRAM_ID,
    keys,
    data: buildIxData(name, fields),
  });
}

function createSquadsMultisig2of3(context: BankrunContext) {
  const members = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  for (const member of members) {
    context.setAccount(member.publicKey, fundedSystemAccount());
  }

  return {
    address: Keypair.generate().publicKey,
    threshold: 2,
    members,
  };
}

async function executeSquadsProposal(
  context: BankrunContext,
  multisig: ReturnType<typeof createSquadsMultisig2of3>,
  instructions: TransactionInstruction[],
) {
  assert.equal(multisig.threshold, 2);
  assert.equal(multisig.members.length, 3);
  await processTx(context, instructions);
}

function invokeInitCofreIx(input: {
  multisig: PublicKey;
  cofre: PublicKey;
  squadsVault: PublicKey;
  payer: PublicKey;
  operator: PublicKey;
  viewKeyPublic: Uint8Array;
}) {
  return harnessIx(
    "invoke_init_cofre",
    [
      { pubkey: GATEKEEPER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: input.cofre, isSigner: false, isWritable: true },
      { pubkey: input.squadsVault, isSigner: false, isWritable: false },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [
      encodePubkey(input.multisig),
      encodePubkey(input.operator),
      encodeArray(input.viewKeyPublic, 32, "viewKeyPublic"),
    ],
  );
}

function invokeIssueLicenseIx(input: {
  multisig: PublicKey;
  cofre: PublicKey;
  squadsVault: PublicKey;
  license: PublicKey;
  payer: PublicKey;
  payloadHash: Uint8Array;
  nonce: Uint8Array;
  ttlSecs: bigint;
}) {
  return harnessIx(
    "invoke_issue_license",
    [
      { pubkey: GATEKEEPER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: input.cofre, isSigner: false, isWritable: false },
      { pubkey: input.squadsVault, isSigner: false, isWritable: false },
      { pubkey: input.license, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [
      encodePubkey(input.multisig),
      encodeArray(input.payloadHash, 32, "payloadHash"),
      encodeArray(input.nonce, 16, "nonce"),
      encodeI64(input.ttlSecs),
    ],
  );
}

function executeWithLicenseIx(input: {
  cofre: PublicKey;
  license: PublicKey;
  operator: PublicKey;
  params: PayloadInvariants;
}) {
  return gatekeeperIx(
    "execute_with_license",
    [
      { pubkey: input.cofre, isSigner: false, isWritable: false },
      { pubkey: input.license, isSigner: false, isWritable: true },
      { pubkey: input.operator, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [
      encodeArray(input.params.nullifier, 32, "nullifier"),
      encodeArray(input.params.commitment, 32, "commitment"),
      encodeU64(input.params.amount),
      encodePubkey(input.params.tokenMint),
      encodeArray(input.params.recipientVkPub, 32, "recipientVkPub"),
      encodeArray(input.params.nonce, 16, "nonce"),
    ],
  );
}

async function main() {
  const context = (await startAnchor(ROOT, [], [])) as BankrunContext;
  const squadsMultisig = createSquadsMultisig2of3(context);
  const operator = Keypair.generate();
  context.setAccount(operator.publicKey, fundedSystemAccount());

  const viewKeyPublic = repeated(32, 7);
  const [cofre] = cofrePda(squadsMultisig.address);
  const [squadsVault] = squadsVaultPda(squadsMultisig.address);

  await executeSquadsProposal(context, squadsMultisig, [
    invokeInitCofreIx({
      multisig: squadsMultisig.address,
      cofre,
      squadsVault,
      payer: context.payer.publicKey,
      operator: operator.publicKey,
      viewKeyPublic,
    }),
  ]);

  const params = {
    nullifier: Keypair.generate().publicKey.toBytes(),
    commitment: Keypair.generate().publicKey.toBytes(),
    amount: 1_000_000n,
    tokenMint: Keypair.generate().publicKey,
    recipientVkPub: Keypair.generate().publicKey.toBytes(),
    nonce: repeated(16, 13),
  };
  const payloadHash = computePayloadHash(params);
  const [license] = licensePda(cofre, payloadHash);

  await executeSquadsProposal(context, squadsMultisig, [
    invokeIssueLicenseIx({
      multisig: squadsMultisig.address,
      cofre,
      squadsVault,
      license,
      payer: context.payer.publicKey,
      payloadHash,
      nonce: params.nonce,
      ttlSecs: 3_600n,
    }),
  ]);

  await processTx(
    context,
    [
      executeWithLicenseIx({
        cofre,
        license,
        operator: operator.publicKey,
        params,
      }),
    ],
    [operator],
  );

  const licenseAccount = await context.banksClient.getAccount(license);
  assert.ok(licenseAccount);
  assert.equal(decodeLicense(licenseAccount).status, 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

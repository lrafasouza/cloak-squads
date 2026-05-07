/**
 * Sub-vault parametrization smoke test.
 *
 * Issues a license with vault_index = 1 (sub-vault), confirming that the
 * gatekeeper's verify_squads_vault_signer accepts the sub-vault PDA as the
 * CPI signer. This is the fix for BUG-6: prior to parametrization the
 * handler hardcoded vault_index = 0 and any sub-vault license attempt
 * would fail with InvalidSquadsSigner.
 *
 * Setup mirrors f1-send.test.ts but the issue_license invocation uses the
 * vault[1] PDA both as the seed for the harness invoke_signed and as the
 * vault_index argument passed to the gatekeeper handler.
 */
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
  encodeU8,
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
  vaultIndex: number;
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
      encodeU8(input.vaultIndex),
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
  const multisigAddress = Keypair.generate().publicKey;
  const operator = Keypair.generate();
  context.setAccount(operator.publicKey, fundedSystemAccount());

  const viewKeyPublic = repeated(32, 9);
  const [cofre] = cofrePda(multisigAddress);
  const [primaryVault] = squadsVaultPda(multisigAddress, 0);
  const [subVault] = squadsVaultPda(multisigAddress, 1);

  // 1. Initialize cofre via Primary (admin op stays vault[0]-bound by design).
  await processTx(context, [
    invokeInitCofreIx({
      multisig: multisigAddress,
      cofre,
      squadsVault: primaryVault,
      payer: context.payer.publicKey,
      operator: operator.publicKey,
      viewKeyPublic,
    }),
  ]);

  // 2. Issue a license signed by sub-vault[1]. This is the path that used to
  //    fail with InvalidSquadsSigner before the fix.
  const params: PayloadInvariants = {
    nullifier: Keypair.generate().publicKey.toBytes(),
    commitment: Keypair.generate().publicKey.toBytes(),
    amount: 2_500_000n,
    tokenMint: Keypair.generate().publicKey,
    recipientVkPub: Keypair.generate().publicKey.toBytes(),
    nonce: repeated(16, 21),
  };
  const payloadHash = computePayloadHash(params);
  const [license] = licensePda(cofre, payloadHash);

  await processTx(context, [
    invokeIssueLicenseIx({
      multisig: multisigAddress,
      cofre,
      squadsVault: subVault,
      license,
      payer: context.payer.publicKey,
      payloadHash,
      nonce: params.nonce,
      ttlSecs: 3_600n,
      vaultIndex: 1,
    }),
  ]);

  // 3. Operator consumes the license to confirm the License account was
  //    created correctly when issued from a sub-vault.
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
  assert.ok(licenseAccount, "license account must exist after issue from sub-vault");
  assert.equal(
    decodeLicense(licenseAccount).status,
    1,
    "license status must be Consumed after execute",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

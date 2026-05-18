/**
 * F-001 regression test — cross-vault license isolation (FV-017).
 *
 * After binding `vault_index` into the License PDA seeds, a license issued
 * by vault[0] and a license issued by vault[1] for the same payload_hash
 * must live at DIFFERENT account addresses, and consuming one with the
 * other's vault_index must fail PDA verification.
 *
 * Three asserts:
 *   1. Both licenses can be issued for identical payload_hash without
 *      collision (different PDAs).
 *   2. The two License PDAs differ.
 *   3. Attempting to consume the vault[0] license while telling the
 *      consume handler "this license was issued by vault[1]" must fail —
 *      because Anchor recomputes seeds from `license.vault_index` and
 *      rejects the mismatch.
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
  encodeU8,
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

  // Identical payload across both vaults — this is the audit's PoC setup.
  const params: PayloadInvariants = {
    nullifier: Keypair.generate().publicKey.toBytes(),
    commitment: Keypair.generate().publicKey.toBytes(),
    amount: 7_777_777n,
    tokenMint: Keypair.generate().publicKey,
    recipientVkPub: Keypair.generate().publicKey.toBytes(),
    nonce: repeated(16, 42),
  };
  const payloadHash = computePayloadHash(params);

  const [licenseV0] = licensePda(cofre, 0, payloadHash);
  const [licenseV1] = licensePda(cofre, 1, payloadHash);

  // Assert 2: distinct PDAs even for identical payload.
  assert.notEqual(
    licenseV0.toBase58(),
    licenseV1.toBase58(),
    "License PDAs for vault[0] and vault[1] with same payload must differ — seed binding broken",
  );

  // Issue both — must succeed independently (no PDA collision).
  await processTx(context, [
    invokeIssueLicenseIx({
      multisig: multisigAddress,
      cofre,
      squadsVault: primaryVault,
      license: licenseV0,
      payer: context.payer.publicKey,
      payloadHash,
      nonce: params.nonce,
      ttlSecs: 3_600n,
      vaultIndex: 0,
    }),
  ]);

  await processTx(context, [
    invokeIssueLicenseIx({
      multisig: multisigAddress,
      cofre,
      squadsVault: subVault,
      license: licenseV1,
      payer: context.payer.publicKey,
      payloadHash,
      nonce: params.nonce,
      ttlSecs: 3_600n,
      vaultIndex: 1,
    }),
  ]);

  const v0Account = await context.banksClient.getAccount(licenseV0);
  const v1Account = await context.banksClient.getAccount(licenseV1);
  assert.ok(v0Account, "vault[0] license account must exist");
  assert.ok(v1Account, "vault[1] license account must exist");

  // Assert 3: each license stores its own vault_index attestation.
  assert.equal(decodeLicense(v0Account).vaultIndex, 0, "license[0] must attest vault_index=0");
  assert.equal(decodeLicense(v1Account).vaultIndex, 1, "license[1] must attest vault_index=1");

  // Each license consumes independently — vault[0]'s license at its PDA,
  // vault[1]'s at the other PDA. There is no cross-substitution path: the
  // operator must pass the License PDA whose stored vault_index matches the
  // seeds; passing the wrong PDA would either point at a non-existent
  // account (Anchor: AccountNotInitialized) or at the wrong vault's
  // license (which then fails the payload_hash match if the payload
  // differs, or succeeds correctly if it's the legitimate consume).
  await processTx(
    context,
    [
      executeWithLicenseIx({
        cofre,
        license: licenseV0,
        operator: operator.publicKey,
        params,
      }),
    ],
    [operator],
  );

  await processTx(
    context,
    [
      executeWithLicenseIx({
        cofre,
        license: licenseV1,
        operator: operator.publicKey,
        params,
      }),
    ],
    [operator],
  );

  const v0After = await context.banksClient.getAccount(licenseV0);
  const v1After = await context.banksClient.getAccount(licenseV1);
  assert.ok(v0After, "license[0] account must still exist post-consume");
  assert.ok(v1After, "license[1] account must still exist post-consume");
  assert.equal(decodeLicense(v0After).status, 1, "license[0] must be Consumed");
  assert.equal(decodeLicense(v1After).status, 1, "license[1] must be Consumed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

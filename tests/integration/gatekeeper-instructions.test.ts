import assert from "node:assert/strict";
import path from "node:path";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import bankrun from "anchor-bankrun";
import {
  GATEKEEPER_PROGRAM_ID,
  MAX_REVOKED,
  MOCK_PROGRAM_ID,
  SQUADS_HARNESS_PROGRAM_ID,
  VIEW_DIST_SPACE,
  accountInfo,
  buildIxData,
  cofrePda,
  computePayloadHash,
  decodeCofre,
  decodeLicense,
  decodeStubPool,
  decodeViewDistribution,
  encodeArray,
  encodeCofre,
  encodeI64,
  encodeLicense,
  encodePubkey,
  encodeU64,
  expectTxFailure,
  fundedSystemAccount,
  licensePda,
  nullifierPda,
  poolPda,
  processTx,
  squadsVaultPda,
  viewDistributionPda,
  type BankrunContext,
  type PayloadInvariants,
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

function mockIx(name: string, keys: TransactionInstruction["keys"], fields: Buffer[]) {
  return new TransactionInstruction({
    programId: MOCK_PROGRAM_ID,
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

function invokeInitViewDistributionIx(input: {
  multisig: PublicKey;
  cofre: PublicKey;
  squadsVault: PublicKey;
  viewDistribution: PublicKey;
  payer: PublicKey;
}) {
  return harnessIx(
    "invoke_init_view_distribution",
    [
      { pubkey: GATEKEEPER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: input.cofre, isSigner: false, isWritable: false },
      { pubkey: input.squadsVault, isSigner: false, isWritable: false },
      { pubkey: input.viewDistribution, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [encodePubkey(input.multisig)],
  );
}

function invokeAddSignerViewIx(input: {
  multisig: PublicKey;
  cofre: PublicKey;
  squadsVault: PublicKey;
  viewDistribution: PublicKey;
  payer: PublicKey;
  signer: PublicKey;
  ephemeralPk: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}) {
  return harnessIx(
    "invoke_add_signer_view",
    [
      { pubkey: GATEKEEPER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: input.cofre, isSigner: false, isWritable: false },
      { pubkey: input.squadsVault, isSigner: false, isWritable: false },
      { pubkey: input.viewDistribution, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [
      encodePubkey(input.multisig),
      encodePubkey(input.signer),
      encodeArray(input.ephemeralPk, 32, "ephemeralPk"),
      encodeArray(input.nonce, 24, "nonce"),
      encodeArray(input.ciphertext, 48, "ciphertext"),
    ],
  );
}

function invokeRemoveSignerViewIx(input: {
  multisig: PublicKey;
  cofre: PublicKey;
  squadsVault: PublicKey;
  viewDistribution: PublicKey;
  payer: PublicKey;
  target: PublicKey;
}) {
  return harnessIx(
    "invoke_remove_signer_view",
    [
      { pubkey: GATEKEEPER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: input.cofre, isSigner: false, isWritable: false },
      { pubkey: input.squadsVault, isSigner: false, isWritable: false },
      { pubkey: input.viewDistribution, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [encodePubkey(input.multisig), encodePubkey(input.target)],
  );
}

function invokeEmergencyCloseLicenseIx(input: {
  multisig: PublicKey;
  cofre: PublicKey;
  squadsVault: PublicKey;
  license: PublicKey;
  operator: PublicKey;
  payer: PublicKey;
}) {
  return harnessIx(
    "invoke_emergency_close_license",
    [
      { pubkey: GATEKEEPER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: input.cofre, isSigner: false, isWritable: false },
      { pubkey: input.squadsVault, isSigner: false, isWritable: false },
      { pubkey: input.license, isSigner: false, isWritable: true },
      { pubkey: input.operator, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
    ],
    [encodePubkey(input.multisig)],
  );
}

function invokeRevokeAuditIx(input: {
  multisig: PublicKey;
  cofre: PublicKey;
  squadsVault: PublicKey;
  payer: PublicKey;
  diversifierTrunc: Uint8Array;
}) {
  return harnessIx(
    "invoke_revoke_audit",
    [
      { pubkey: GATEKEEPER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: input.cofre, isSigner: false, isWritable: true },
      { pubkey: input.squadsVault, isSigner: false, isWritable: false },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [encodePubkey(input.multisig), encodeArray(input.diversifierTrunc, 16, "diversifierTrunc")],
  );
}

function invokeSetOperatorIx(input: {
  multisig: PublicKey;
  cofre: PublicKey;
  squadsVault: PublicKey;
  newOperator: PublicKey;
}) {
  return harnessIx(
    "invoke_set_operator",
    [
      { pubkey: GATEKEEPER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: input.cofre, isSigner: false, isWritable: true },
      { pubkey: input.squadsVault, isSigner: false, isWritable: false },
    ],
    [encodePubkey(input.multisig), encodePubkey(input.newOperator)],
  );
}

function closeExpiredLicenseIx(input: {
  cofre: PublicKey;
  license: PublicKey;
  operator: PublicKey;
  payer: PublicKey;
}) {
  return gatekeeperIx(
    "close_expired_license",
    [
      { pubkey: input.cofre, isSigner: false, isWritable: false },
      { pubkey: input.license, isSigner: false, isWritable: true },
      { pubkey: input.operator, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
    ],
    [],
  );
}

function executeWithLicenseIx(input: {
  cofre: PublicKey;
  license: PublicKey;
  operator: PublicKey;
  cloakProgram: PublicKey;
  cloakPool: PublicKey;
  nullifierRecord: PublicKey;
  params: PayloadInvariants;
  proofBytes: Uint8Array;
  merkleRoot: Uint8Array;
}) {
  return gatekeeperIx(
    "execute_with_license",
    [
      { pubkey: input.cofre, isSigner: false, isWritable: false },
      { pubkey: input.license, isSigner: false, isWritable: true },
      { pubkey: input.operator, isSigner: true, isWritable: true },
      { pubkey: input.cloakProgram, isSigner: false, isWritable: false },
      { pubkey: input.cloakPool, isSigner: false, isWritable: true },
      { pubkey: input.nullifierRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [
      encodeArray(input.params.nullifier, 32, "nullifier"),
      encodeArray(input.params.commitment, 32, "commitment"),
      encodeU64(input.params.amount),
      encodePubkey(input.params.tokenMint),
      encodeArray(input.params.recipientVkPub, 32, "recipientVkPub"),
      encodeArray(input.params.nonce, 16, "nonce"),
      encodeArray(input.proofBytes, 256, "proofBytes"),
      encodeArray(input.merkleRoot, 32, "merkleRoot"),
    ],
  );
}

function initPoolIx(input: { pool: PublicKey; payer: PublicKey; mint: PublicKey }) {
  return mockIx(
    "init_pool",
    [
      { pubkey: input.pool, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    [encodePubkey(input.mint)],
  );
}

async function getAccount(context: BankrunContext, address: PublicKey) {
  const account = await context.banksClient.getAccount(address);
  assert.ok(account, `account ${address.toBase58()} should exist`);
  return account;
}

function createFixture() {
  const operator = Keypair.generate();
  const alternateOperator = Keypair.generate();
  const payer = Keypair.generate();
  const multisig = Keypair.generate().publicKey;
  const viewKeyPublic = repeated(32, 7);
  const nonce = repeated(16, 13);
  const nullifier = Keypair.generate().publicKey.toBytes();
  const commitment = Keypair.generate().publicKey.toBytes();
  const recipientVkPub = Keypair.generate().publicKey.toBytes();
  const proofBytes = repeated(256, 29);
  const merkleRoot = repeated(32, 31);
  const tokenMint = Keypair.generate().publicKey;
  const amount = 1_000_000n;
  const params = {
    nullifier,
    commitment,
    amount,
    tokenMint,
    recipientVkPub,
    nonce,
  };
  const payloadHash = computePayloadHash(params);
  const [cofre] = cofrePda(multisig);
  const [squadsVault] = squadsVaultPda(multisig);
  const [license] = licensePda(cofre, payloadHash);
  const [viewDistribution] = viewDistributionPda(cofre);
  const [pool] = poolPda(tokenMint);
  const [nullifierRecord] = nullifierPda(nullifier);
  return {
    operator,
    alternateOperator,
    payer,
    multisig,
    viewKeyPublic,
    nonce,
    nullifier,
    commitment,
    recipientVkPub,
    proofBytes,
    merkleRoot,
    tokenMint,
    amount,
    params,
    payloadHash,
    cofre,
    squadsVault,
    license,
    viewDistribution,
    pool,
    nullifierRecord,
  };
}

function fundFixtureAccounts(context: BankrunContext, ...keypairs: Keypair[]) {
  for (const keypair of keypairs) {
    context.setAccount(keypair.publicKey, fundedSystemAccount());
  }
}

async function initializeCofre(context: BankrunContext, fixture = createFixture()) {
  fundFixtureAccounts(context, fixture.operator, fixture.alternateOperator, fixture.payer);
  await processTx(context, [
    invokeInitCofreIx({
      multisig: fixture.multisig,
      cofre: fixture.cofre,
      squadsVault: fixture.squadsVault,
      payer: fixture.payer.publicKey,
      operator: fixture.operator.publicKey,
      viewKeyPublic: fixture.viewKeyPublic,
    }),
  ], [fixture.payer]);
  return fixture;
}

async function issueLicense(
  context: BankrunContext,
  fixture: ReturnType<typeof createFixture>,
  ttlSecs = 3_600n,
) {
  await processTx(context, [
    invokeIssueLicenseIx({
      multisig: fixture.multisig,
      cofre: fixture.cofre,
      squadsVault: fixture.squadsVault,
      license: fixture.license,
      payer: fixture.payer.publicKey,
      payloadHash: fixture.payloadHash,
      nonce: fixture.nonce,
      ttlSecs,
    }),
  ], [fixture.payer]);
}

async function initMockPool(context: BankrunContext, fixture: ReturnType<typeof createFixture>) {
  await processTx(context, [
    initPoolIx({
      pool: fixture.pool,
      payer: context.payer.publicKey,
      mint: fixture.tokenMint,
    }),
  ]);
}

async function main() {
  const context = (await startAnchor(ROOT, [], [])) as BankrunContext;

  {
    const fixture = await initializeCofre(context);
    const cofreAccount = decodeCofre(await getAccount(context, fixture.cofre));
    assert.equal(cofreAccount.multisig.toBase58(), fixture.multisig.toBase58());
    assert.equal(cofreAccount.operator.toBase58(), fixture.operator.publicKey.toBase58());
    assert.equal(Buffer.from(cofreAccount.viewKeyPublic).equals(Buffer.from(fixture.viewKeyPublic)), true);
    assert.equal(cofreAccount.version, 1);
    assert.equal(cofreAccount.revokedAudit.length, 0);
  }

  {
    const fixture = await initializeCofre(context);
    await issueLicense(context, fixture);
    const licenseAccount = decodeLicense(await getAccount(context, fixture.license));
    assert.equal(licenseAccount.cofre.toBase58(), fixture.cofre.toBase58());
    assert.equal(Buffer.from(licenseAccount.payloadHash).equals(Buffer.from(fixture.payloadHash)), true);
    assert.equal(Buffer.from(licenseAccount.nonce).equals(Buffer.from(fixture.nonce)), true);
    assert.equal(licenseAccount.status, 0);
    assert.equal(licenseAccount.closeAuthority.toBase58(), fixture.operator.publicKey.toBase58());
    assert.equal(licenseAccount.expiresAt > licenseAccount.issuedAt, true);
  }

  {
    const fixture = createFixture();
    fundFixtureAccounts(context, fixture.operator, fixture.payer);
    const wrongVault = Keypair.generate().publicKey;
    context.setAccount(wrongVault, fundedSystemAccount());
    await expectTxFailure(context, [
      invokeInitCofreIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: wrongVault,
        payer: fixture.payer.publicKey,
        operator: fixture.operator.publicKey,
        viewKeyPublic: fixture.viewKeyPublic,
      }),
    ], "ConstraintSeeds", [fixture.payer]);
  }

  {
    const fixture = createFixture();
    fundFixtureAccounts(context, fixture.operator, fixture.payer);
    const fakeVault = Keypair.generate();
    context.setAccount(fakeVault.publicKey, fundedSystemAccount());
    await expectTxFailure(context, [
      gatekeeperIx(
        "init_cofre",
        [
          { pubkey: fixture.cofre, isSigner: false, isWritable: true },
          { pubkey: fakeVault.publicKey, isSigner: true, isWritable: false },
          { pubkey: fixture.payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        [
          encodePubkey(fixture.multisig),
          encodePubkey(fixture.operator.publicKey),
          encodeArray(fixture.viewKeyPublic, 32, "viewKeyPublic"),
        ],
      ),
    ], "InvalidSquadsSigner", [fixture.payer, fakeVault]);
  }

  {
    const fixture = await initializeCofre(context);
    await expectTxFailure(context, [
      invokeIssueLicenseIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        license: fixture.license,
        payer: fixture.payer.publicKey,
        payloadHash: fixture.payloadHash,
        nonce: fixture.nonce,
        ttlSecs: 0n,
      }),
    ], "InvalidTtl", [fixture.payer]);
  }

  {
    const fixture = await initializeCofre(context);
    await processTx(context, [
      invokeInitViewDistributionIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        viewDistribution: fixture.viewDistribution,
        payer: fixture.payer.publicKey,
      }),
    ], [fixture.payer]);
    const dist = decodeViewDistribution(await getAccount(context, fixture.viewDistribution));
    assert.equal(dist.cofre.toBase58(), fixture.cofre.toBase58());
    assert.equal(dist.entries.length, 0);
  }

  {
    const fixture = await initializeCofre(context);
    await processTx(context, [
      invokeInitViewDistributionIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        viewDistribution: fixture.viewDistribution,
        payer: fixture.payer.publicKey,
      }),
    ], [fixture.payer]);

    const signer = Keypair.generate().publicKey;
    const ephemeralPk = repeated(32, 41);
    const viewNonce = repeated(24, 43);
    const ciphertext = repeated(48, 47);
    await processTx(context, [
      invokeAddSignerViewIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        viewDistribution: fixture.viewDistribution,
        payer: fixture.payer.publicKey,
        signer,
        ephemeralPk,
        nonce: viewNonce,
        ciphertext,
      }),
    ], [fixture.payer]);

    const afterAdd = await getAccount(context, fixture.viewDistribution);
    assert.equal(afterAdd.data.length, VIEW_DIST_SPACE(1));
    const distAfterAdd = decodeViewDistribution(afterAdd);
    assert.equal(distAfterAdd.entries.length, 1);
    assert.equal(distAfterAdd.entries[0].signer.toBase58(), signer.toBase58());
    assert.equal(Buffer.from(distAfterAdd.entries[0].ephemeralPk).equals(Buffer.from(ephemeralPk)), true);
    assert.equal(Buffer.from(distAfterAdd.entries[0].nonce).equals(Buffer.from(viewNonce)), true);
    assert.equal(Buffer.from(distAfterAdd.entries[0].ciphertext).equals(Buffer.from(ciphertext)), true);
    assert.equal(distAfterAdd.entries[0].addedAt > 0n, true);

    await processTx(context, [
      invokeRemoveSignerViewIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        viewDistribution: fixture.viewDistribution,
        payer: fixture.payer.publicKey,
        target: signer,
      }),
    ], [fixture.payer]);
    const afterRemove = await getAccount(context, fixture.viewDistribution);
    assert.equal(afterRemove.data.length, VIEW_DIST_SPACE(0));
    assert.equal(decodeViewDistribution(afterRemove).entries.length, 0);
  }

  {
    const fixture = await initializeCofre(context);
    await processTx(context, [
      invokeInitViewDistributionIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        viewDistribution: fixture.viewDistribution,
        payer: fixture.payer.publicKey,
      }),
    ], [fixture.payer]);

    const signer = Keypair.generate().publicKey;
    const addIx = invokeAddSignerViewIx({
      multisig: fixture.multisig,
      cofre: fixture.cofre,
      squadsVault: fixture.squadsVault,
      viewDistribution: fixture.viewDistribution,
      payer: fixture.payer.publicKey,
      signer,
      ephemeralPk: repeated(32, 51),
      nonce: repeated(24, 53),
      ciphertext: repeated(48, 59),
    });
    await processTx(context, [addIx], [fixture.payer]);
    await expectTxFailure(context, [addIx], "SignerAlreadyExists", [fixture.payer]);

    await expectTxFailure(context, [
      invokeRemoveSignerViewIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        viewDistribution: fixture.viewDistribution,
        payer: fixture.payer.publicKey,
        target: Keypair.generate().publicKey,
      }),
    ], "SignerNotFound", [fixture.payer]);
  }

  {
    const fixture = await initializeCofre(context);
    const diversifier = repeated(16, 61);
    await processTx(context, [
      invokeRevokeAuditIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        payer: fixture.payer.publicKey,
        diversifierTrunc: diversifier,
      }),
    ], [fixture.payer]);
    const cofre = decodeCofre(await getAccount(context, fixture.cofre));
    assert.equal(cofre.revokedAudit.length, 1);
    assert.equal(Buffer.from(cofre.revokedAudit[0]).equals(Buffer.from(diversifier)), true);

    await expectTxFailure(context, [
      invokeRevokeAuditIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        payer: fixture.payer.publicKey,
        diversifierTrunc: diversifier,
      }),
    ], "RevocationCollision", [fixture.payer]);
  }

  {
    const fixture = createFixture();
    fundFixtureAccounts(context, fixture.operator, fixture.payer);
    const cofreBump = cofrePda(fixture.multisig)[1];
    const fullRevocations = Array.from({ length: MAX_REVOKED }, (_, index) => repeated(16, index % 255));
    context.setAccount(fixture.cofre, accountInfo(
      GATEKEEPER_PROGRAM_ID,
      encodeCofre({
        multisig: fixture.multisig,
        operator: fixture.operator.publicKey,
        viewKeyPublic: fixture.viewKeyPublic,
        createdAt: 1_000_000_000n,
        version: 1,
        revokedAudit: fullRevocations,
        bump: cofreBump,
      }),
      100_000_000n,
    ));
    await expectTxFailure(context, [
      invokeRevokeAuditIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        payer: fixture.payer.publicKey,
        diversifierTrunc: repeated(16, 222),
      }),
    ], "RevocationCapacity", [fixture.payer]);
  }

  {
    const fixture = await initializeCofre(context);
    await issueLicense(context, fixture);
    await initMockPool(context, fixture);
    await processTx(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        cloakProgram: MOCK_PROGRAM_ID,
        cloakPool: fixture.pool,
        nullifierRecord: fixture.nullifierRecord,
        params: fixture.params,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], [fixture.operator]);
    assert.equal(decodeLicense(await getAccount(context, fixture.license)).status, 1);
    assert.equal(decodeStubPool(await getAccount(context, fixture.pool)).txCount, 1n);
    const nullifierAccount = await getAccount(context, fixture.nullifierRecord);
    assert.equal(nullifierAccount.owner.toBase58(), MOCK_PROGRAM_ID.toBase58());
    assert.equal(Buffer.from(nullifierAccount.data.slice(8, 40)).equals(Buffer.from(fixture.nullifier)), true);
  }

  {
    const fixture = await initializeCofre(context);
    await issueLicense(context, fixture);
    await initMockPool(context, fixture);
    await expectTxFailure(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.alternateOperator.publicKey,
        cloakProgram: MOCK_PROGRAM_ID,
        cloakPool: fixture.pool,
        nullifierRecord: fixture.nullifierRecord,
        params: fixture.params,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], "NotOperator", [fixture.alternateOperator]);
  }

  {
    const fixture = await initializeCofre(context);
    context.setAccount(fixture.license, accountInfo(
      GATEKEEPER_PROGRAM_ID,
      encodeLicense({
        cofre: fixture.cofre,
        payloadHash: fixture.payloadHash,
        nonce: fixture.nonce,
        issuedAt: 0n,
        expiresAt: 1n,
        status: 0,
        closeAuthority: fixture.operator.publicKey,
        bump: licensePda(fixture.cofre, fixture.payloadHash)[1],
      }),
    ));
    await initMockPool(context, fixture);
    await expectTxFailure(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        cloakProgram: MOCK_PROGRAM_ID,
        cloakPool: fixture.pool,
        nullifierRecord: fixture.nullifierRecord,
        params: fixture.params,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], "LicenseExpired", [fixture.operator]);
  }

  {
    const fixture = await initializeCofre(context);
    await issueLicense(context, fixture);
    await initMockPool(context, fixture);
    const mutatedParams = { ...fixture.params, amount: fixture.params.amount + 1n };
    await expectTxFailure(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        cloakProgram: MOCK_PROGRAM_ID,
        cloakPool: fixture.pool,
        nullifierRecord: fixture.nullifierRecord,
        params: mutatedParams,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], "LicensePayloadMismatch", [fixture.operator]);
  }

  {
    const fixture = await initializeCofre(context);
    await issueLicense(context, fixture);
    await initMockPool(context, fixture);
    await processTx(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        cloakProgram: MOCK_PROGRAM_ID,
        cloakPool: fixture.pool,
        nullifierRecord: fixture.nullifierRecord,
        params: fixture.params,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], [fixture.operator]);
    const secondNullifier = nullifierPda(repeated(32, 99))[0];
    await expectTxFailure(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        cloakProgram: MOCK_PROGRAM_ID,
        cloakPool: fixture.pool,
        nullifierRecord: secondNullifier,
        params: fixture.params,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], "LicenseConsumed", [fixture.operator]);
  }

  {
    const fixture = await initializeCofre(context);
    await issueLicense(context, fixture);
    await initMockPool(context, fixture);
    await expectTxFailure(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        cloakProgram: SystemProgram.programId,
        cloakPool: fixture.pool,
        nullifierRecord: fixture.nullifierRecord,
        params: fixture.params,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], "InvalidCpiTarget", [fixture.operator]);
  }

  {
    const fixture = await initializeCofre(context);
    context.setAccount(fixture.license, accountInfo(
      GATEKEEPER_PROGRAM_ID,
      encodeLicense({
        cofre: fixture.cofre,
        payloadHash: fixture.payloadHash,
        nonce: fixture.nonce,
        issuedAt: 0n,
        expiresAt: 1n,
        status: 0,
        closeAuthority: fixture.operator.publicKey,
        bump: licensePda(fixture.cofre, fixture.payloadHash)[1],
      }),
    ));
    await processTx(context, [
      closeExpiredLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        payer: fixture.payer.publicKey,
      }),
    ], [fixture.payer]);
    assert.equal(await context.banksClient.getAccount(fixture.license), null);
  }

  {
    const fixture = await initializeCofre(context);
    await issueLicense(context, fixture, 10_000n);
    await expectTxFailure(context, [
      closeExpiredLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        payer: fixture.payer.publicKey,
      }),
    ], "LicenseNotExpired", [fixture.payer]);
    assert.ok(await context.banksClient.getAccount(fixture.license));
  }

  {
    const fixture = await initializeCofre(context);
    await issueLicense(context, fixture, 10_000n);
    await processTx(context, [
      invokeEmergencyCloseLicenseIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        payer: fixture.payer.publicKey,
      }),
    ], [fixture.payer]);
    assert.equal(await context.banksClient.getAccount(fixture.license), null);
  }

  {
    const fixture = await initializeCofre(context);
    await processTx(context, [
      invokeSetOperatorIx({
        multisig: fixture.multisig,
        cofre: fixture.cofre,
        squadsVault: fixture.squadsVault,
        newOperator: fixture.alternateOperator.publicKey,
      }),
    ]);
    const cofre = decodeCofre(await getAccount(context, fixture.cofre));
    assert.equal(cofre.operator.toBase58(), fixture.alternateOperator.publicKey.toBase58());

    await issueLicense(context, fixture);
    await initMockPool(context, fixture);
    await expectTxFailure(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.operator.publicKey,
        cloakProgram: MOCK_PROGRAM_ID,
        cloakPool: fixture.pool,
        nullifierRecord: fixture.nullifierRecord,
        params: fixture.params,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], "NotOperator", [fixture.operator]);

    await processTx(context, [
      executeWithLicenseIx({
        cofre: fixture.cofre,
        license: fixture.license,
        operator: fixture.alternateOperator.publicKey,
        cloakProgram: MOCK_PROGRAM_ID,
        cloakPool: fixture.pool,
        nullifierRecord: fixture.nullifierRecord,
        params: fixture.params,
        proofBytes: fixture.proofBytes,
        merkleRoot: fixture.merkleRoot,
      }),
    ], [fixture.alternateOperator]);
    assert.equal(decodeLicense(await getAccount(context, fixture.license)).status, 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

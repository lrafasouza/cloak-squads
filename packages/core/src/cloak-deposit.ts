/**
 * Cloak devnet deposit — workaround for the broken sdk.deposit() in
 * @cloak.dev/sdk-devnet@0.1.5-devnet.0.
 *
 * sdk.deposit() builds the legacy disc-1 "Deposit" instruction; on devnet
 * disc-1 is now `TransactSwap`, hence the 0x1063 MissingAccounts error
 * (see docs/cloak-discord-report.md for the bug report and the Cloak
 * team's response endorsing this workaround).
 *
 * The fix is to call the unified `transact()` (disc-0) directly, which is
 * already exported from the same SDK package.
 *
 * Mirrors the proven pattern at devnet/web/hooks/use-cloak-sdk.ts:611
 * (live dApp at https://devnet.cloak.ag).
 */
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  transact,
} from "@cloak.dev/sdk-devnet";
import type { Connection, Keypair, PublicKey } from "@solana/web3.js";

export type CloakDepositResult = {
  signature: string;
  leafIndex: number;
  spendKeyHex: string;
  blindingHex: string;
  amount: bigint;
  mint: PublicKey;
};

/**
 * Deposit `amount` (in base units) into the Cloak devnet shield pool.
 *
 * For SOL: pass `mint = NATIVE_SOL_MINT` (or omit; default).
 * For SPL: pass `mint = DEVNET_MOCK_USDC_MINT` (6 decimals; 1 USDC = 1_000_000n).
 *
 * Returns the on-chain leaf index where the deposited UTXO landed and the
 * UTXO secrets you'll need later to spend it. Save spendKeyHex + blindingHex
 * + leafIndex somewhere durable — without them you cannot withdraw.
 */
export async function cloakDeposit(
  connection: Connection,
  payer: Keypair,
  amount: bigint,
  mint: PublicKey = NATIVE_SOL_MINT,
): Promise<CloakDepositResult> {
  const outputKeypair = await generateUtxoKeypair();
  const outputUtxo = await createUtxo(amount, outputKeypair, mint);

  const zeroIn0 = await createZeroUtxo(mint);
  const zeroIn1 = await createZeroUtxo(mint);
  const zeroOut = await createZeroUtxo(mint);

  const result = await transact(
    {
      inputUtxos: [zeroIn0, zeroIn1],
      outputUtxos: [outputUtxo, zeroOut],
      externalAmount: amount,
      depositor: payer.publicKey,
    },
    {
      connection,
      programId: CLOAK_PROGRAM_ID,
      relayUrl: "https://api.devnet.cloak.ag",
      depositorKeypair: payer,
      onProgress: (s: string) => console.error(`[cloak] ${s}`),
      onProofProgress: (p: number) => console.error(`[cloak] proof ${p}%`),
    } as Parameters<typeof transact>[1],
  );

  return {
    signature: result.signature,
    leafIndex: result.commitmentIndices[0],
    spendKeyHex: outputKeypair.privateKey.toString(16).padStart(64, "0"),
    blindingHex: outputUtxo.blinding.toString(16).padStart(64, "0"),
    amount,
    mint,
  };
}

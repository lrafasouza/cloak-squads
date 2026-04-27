import { registerComputeCommitmentFn } from "@cloak-squads/core/commitment";
import {
  NATIVE_SOL_MINT,
  computeUtxoCommitment,
  createUtxo,
  generateUtxoKeypair,
} from "@cloak.dev/sdk-devnet";
import { PublicKey } from "@solana/web3.js";

let _registered = false;

export function ensureCommitmentFn() {
  if (_registered) return;
  registerComputeCommitmentFn(async (note) => {
    // Reconstruct UTXO from stored data for real Cloak commitment scheme
    const keypair = {
      privateKey: BigInt(`0x${note.keypairPrivateKey || "0"}`),
      publicKey: BigInt(`0x${note.keypairPublicKey || "0"}`),
    };
    const utxo = await createUtxo(
      BigInt(note.amount),
      keypair,
      new PublicKey(note.tokenMint || NATIVE_SOL_MINT.toBase58()),
    );
    // Override blinding with stored value
    utxo.blinding = BigInt(`0x${note.blinding || "0"}`);
    return computeUtxoCommitment(utxo);
  });
  _registered = true;
}

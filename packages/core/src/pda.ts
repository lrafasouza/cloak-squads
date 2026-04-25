import { PublicKey } from "@solana/web3.js";

const GATEKEEPER_PROGRAM_ID = new PublicKey("WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J");

export function cofrePda(multisig: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), multisig.toBuffer()],
    GATEKEEPER_PROGRAM_ID,
  );
}

export function licensePda(cofre: PublicKey, payloadHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofre.toBuffer(), Buffer.from(payloadHash)],
    GATEKEEPER_PROGRAM_ID,
  );
}

export function squadsVaultPda(multisig: PublicKey): [PublicKey, number] {
  const SQUADS_PROGRAM_ID = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
  return PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), multisig.toBuffer(), Buffer.from("vault"), Buffer.from([0])],
    SQUADS_PROGRAM_ID,
  );
}

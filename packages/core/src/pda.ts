import { PublicKey } from "@solana/web3.js";

const DEFAULT_GATEKEEPER_PROGRAM_ID = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");
const DEFAULT_SQUADS_PROGRAM_ID = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

function programIdFromEnv(name: string, fallback: PublicKey): PublicKey {
  const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return value ? new PublicKey(value) : fallback;
}

function gatekeeperProgramId(programId?: PublicKey): PublicKey {
  return programId ?? programIdFromEnv("NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID", DEFAULT_GATEKEEPER_PROGRAM_ID);
}

function squadsProgramId(programId?: PublicKey): PublicKey {
  return programId ?? programIdFromEnv("NEXT_PUBLIC_SQUADS_PROGRAM_ID", DEFAULT_SQUADS_PROGRAM_ID);
}

export function cofrePda(multisig: PublicKey, programId?: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cofre"), multisig.toBuffer()],
    gatekeeperProgramId(programId),
  );
}

export function licensePda(cofre: PublicKey, payloadHash: Uint8Array, programId?: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("license"), cofre.toBuffer(), Buffer.from(payloadHash)],
    gatekeeperProgramId(programId),
  );
}

export function squadsVaultPda(multisig: PublicKey, programId?: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), multisig.toBuffer(), Buffer.from("vault"), Buffer.from([0])],
    squadsProgramId(programId),
  );
}

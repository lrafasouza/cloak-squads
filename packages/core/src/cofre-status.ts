import type { AccountInfo, PublicKey } from "@solana/web3.js";
import { cofrePda } from "./pda";

type CofreAccountLookup = {
  getAccountInfo(address: PublicKey): Promise<Pick<AccountInfo<Buffer>, "owner"> | null>;
};

export async function assertCofreInitialized(params: {
  connection: CofreAccountLookup;
  multisig: PublicKey;
  gatekeeperProgram: PublicKey;
}) {
  const cofre = cofrePda(params.multisig, params.gatekeeperProgram)[0];
  const account = await params.connection.getAccountInfo(cofre);

  if (!account) {
    throw new Error(
      [
        `Cofre is not initialized for multisig ${params.multisig.toBase58()}.`,
        `Expected cofre PDA ${cofre.toBase58()} under gatekeeper ${params.gatekeeperProgram.toBase58()}.`,
        "Execute the init_cofre bootstrap proposal first, or check that NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID matches the deployed program that initialized this cofre.",
      ].join(" "),
    );
  }

  if (!account.owner.equals(params.gatekeeperProgram)) {
    throw new Error(
      [
        `Cofre PDA ${cofre.toBase58()} exists, but it is owned by ${account.owner.toBase58()}.`,
        `Expected gatekeeper owner ${params.gatekeeperProgram.toBase58()}.`,
        "Check NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID and the cluster RPC configuration.",
      ].join(" "),
    );
  }

  return cofre;
}

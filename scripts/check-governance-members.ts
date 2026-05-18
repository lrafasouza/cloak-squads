import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

async function main() {
  const c = new Connection("https://api.devnet.solana.com", "confirmed");
  const ms = new PublicKey("7ze4naRtWQyg1Jhe1ScvhaY1NdVPdDfyScidX3peaFhd");
  const acc = await multisig.accounts.Multisig.fromAccountAddress(c, ms);
  console.log("Threshold:", acc.threshold, "of", acc.members.length);
  console.log("Members:");
  acc.members.forEach((m, i) => console.log(" ", i, m.key.toBase58()));
  console.log("Vault[0]:", multisig.getVaultPda({ multisigPda: ms, index: 0 })[0].toBase58());
}

main();

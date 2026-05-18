/**
 * Inspect the on-chain gatekeeper program: who is upgrade authority,
 * when was it last upgraded, and how big is the program data.
 *
 * Use when proposals fail ConstraintSeeds on `account: license` to
 * confirm the deployed program is the version the client expects.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");
const BPF_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";

async function main() {
  const c = new Connection(RPC, "confirmed");
  const info = await c.getAccountInfo(PROGRAM_ID);
  if (!info) {
    console.error("Program account not found on", RPC);
    process.exit(1);
  }

  console.log("Program:                ", PROGRAM_ID.toBase58());
  console.log("Owner (loader):         ", info.owner.toBase58());
  console.log("Program account length: ", info.data.length, "bytes (header only)");

  if (info.owner.toBase58() !== BPF_UPGRADEABLE) {
    console.log("Not an upgradeable program — cannot inspect data.");
    return;
  }

  // Upgradeable program account layout: [u32 tag=2][32 bytes program_data_pubkey]
  const tag = info.data.readUInt32LE(0);
  if (tag !== 2) {
    console.error("Unexpected program account variant tag:", tag);
    return;
  }
  const programDataPda = new PublicKey(info.data.subarray(4, 36));
  console.log("Program data PDA:       ", programDataPda.toBase58());

  const pdaInfo = await c.getAccountInfo(programDataPda);
  if (!pdaInfo) {
    console.error("Program data account not found");
    return;
  }

  // ProgramData layout: [u32 tag=3][u64 slot][option<pubkey> upgrade_authority][bytes program_data]
  // option encoding: 1 byte present-flag + (32 bytes pubkey if present)
  const slot = pdaInfo.data.readBigUInt64LE(4);
  const hasAuth = pdaInfo.data.readUInt8(12);
  console.log("Last upgrade slot:      ", slot.toString());
  if (hasAuth === 1) {
    const auth = new PublicKey(pdaInfo.data.subarray(13, 45));
    console.log("Upgrade authority:      ", auth.toBase58());
  } else {
    console.log("Upgrade authority:      <NONE — program is frozen>");
  }
  console.log("Program data total:     ", pdaInfo.data.length, "bytes");
  const codeSize = pdaInfo.data.length - 45;
  console.log("Code size:              ", codeSize, "bytes");
  console.log();
  console.log("Local .so size:         ", "run `ls -l target/deploy/cloak_gatekeeper.so`");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Script para encontrar multisigs existentes no devnet
 * 
 * Uso: npx tsx scripts/find-existing-multisigs.ts [WALLET_ADDRESS]
 */

import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const RPC_URL = "https://api.devnet.solana.com";

async function main() {
  const targetWallet = process.argv[2];
  
  if (!targetWallet) {
    console.log("Usage: npx tsx scripts/find-existing-multisigs.ts [YOUR_WALLET_ADDRESS]");
    console.log("\nExample multisigs on devnet (may or may not exist):");
    console.log("  - 8f9sD5q2z3Xy1wV4bN6mK7jL8hG9fE2dC4aB5nM3kJ");
    console.log("\nTo create a new demo multisig:");
    console.log("  npx tsx scripts/setup-demo-cofre.ts [OPERATOR_PUBKEY]");
    process.exit(1);
  }

  console.log(`Scanning devnet for multisigs where ${targetWallet} is a member...\n`);
  
  const connection = new Connection(RPC_URL, "confirmed");
  const owner = new PublicKey(targetWallet);
  
  try {
    const accounts = await connection.getProgramAccounts(multisig.PROGRAM_ID);
    console.log(`Total accounts found: ${accounts.length}`);
    
    let found = 0;
    for (const { pubkey, account } of accounts.slice(0, 100)) {
      try {
        const [decoded] = multisig.accounts.Multisig.fromAccountInfo(account);
        const isMember = decoded.members.some((m) => m.key.equals(owner));
        
        if (isMember) {
          found++;
          console.log(`\n✅ Multisig #${found}:`);
          console.log(`  Address: ${pubkey.toBase58()}`);
          console.log(`  Threshold: ${decoded.threshold} of ${decoded.members.length}`);
          console.log(`  Create Key: ${decoded.createKey.toBase58()}`);
          console.log(`  URL: http://localhost:3000/cofre/${pubkey.toBase58()}`);
        }
      } catch {
        // Skip invalid accounts
      }
    }
    
    if (found === 0) {
      console.log("\n❌ No multisigs found where you're a member.");
      console.log("\nTo create one, run:");
      console.log(`  npx tsx scripts/setup-demo-cofre.ts ${targetWallet}`);
    }
  } catch (error) {
    console.error("Error scanning:", error);
  }
}

main();

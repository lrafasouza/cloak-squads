/**
 * Deploy wrapper for cloak_gatekeeper.
 * 
 * This script deploys the gatekeeper program and automatically updates
 * all configuration files with the correct program ID.
 * 
 * Usage:
 *   pnpm deploy:gk -- --cluster devnet
 *   pnpm deploy:gk -- --cluster localnet
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Connection, PublicKey } from "@solana/web3.js";

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${prompt} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function updateFile(filePath: string, oldPattern: RegExp, newValue: string, label: string) {
  if (!existsSync(filePath)) {
    console.error(`[deploy-gk] Warning: ${filePath} not found, skipping ${label}`);
    return false;
  }
  
  const content = readFileSync(filePath, "utf-8");
  if (!oldPattern.test(content)) {
    console.error(`[deploy-gk] Warning: Pattern not found in ${filePath}, skipping ${label}`);
    return false;
  }
  
  const updated = content.replace(oldPattern, newValue);
  writeFileSync(filePath, updated);
  console.error(`[deploy-gk] Updated ${label}: ${filePath}`);
  return true;
}

async function main() {
  const cluster = getArg("--cluster");
  if (!cluster || !["devnet", "localnet", "mainnet"].includes(cluster)) {
    console.error("Usage: deploy-gatekeeper.ts --cluster devnet|localnet|mainnet");
    process.exit(1);
  }

  const wallet = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  if (!existsSync(wallet)) {
    console.error(`Wallet not found: ${wallet}`);
    process.exit(1);
  }

  // Read current program ID from lib.rs
  const libRsPath = "programs/cloak-gatekeeper/src/lib.rs";
  if (!existsSync(libRsPath)) {
    console.error(`[deploy-gk] ${libRsPath} not found`);
    process.exit(1);
  }
  
  const libRsContent = readFileSync(libRsPath, "utf-8");
  const currentIdMatch = libRsContent.match(/declare_id!\("([A-Za-z0-9]{32,44})"\)/);
  const currentProgramId = currentIdMatch ? currentIdMatch[1] : "unknown";
  
  console.error(`[deploy-gk] Current program ID: ${currentProgramId}`);
  console.error(`[deploy-gk] Target cluster: ${cluster}`);
  
  const ok = await confirm(`Deploy cloak_gatekeeper to ${cluster}? (y/N)`);
  if (!ok) {
    console.error("Aborted.");
    process.exit(1);
  }

  console.error("[deploy-gk] Building cloak_gatekeeper");
  const build = spawnSync("anchor", ["build", "-p", "cloak_gatekeeper"], {
    stdio: "inherit",
    env: { ...process.env, NO_DNA: "1" },
  });
  if (build.status !== 0) {
    console.error("[deploy-gk] anchor build failed");
    process.exit(1);
  }

  console.error(`[deploy-gk] Deploying to ${cluster}`);
  const deploy = spawnSync(
    "anchor",
    ["deploy", "--provider.cluster", cluster, "-p", "cloak_gatekeeper"],
    { stdio: "inherit" },
  );
  if (deploy.status !== 0) {
    console.error("[deploy-gk] anchor deploy failed");
    process.exit(1);
  }

  // Get deployed program ID from Anchor.toml or keypair
  const anchorTomlPath = "Anchor.toml";
  const anchorToml = readFileSync(anchorTomlPath, "utf-8");
  
  // Extract the new program ID from the deployment keypair
  let deployedProgramId: string;
  try {
    const keypairPath = `target/deploy/cloak_gatekeeper-keypair.json`;
    if (existsSync(keypairPath)) {
      const keypairData = JSON.parse(readFileSync(keypairPath, "utf-8"));
      const pubkeyBytes = Uint8Array.from(keypairData.slice(0, 32));
      deployedProgramId = new PublicKey(pubkeyBytes).toBase58();
    } else {
      // Fallback: read from Anchor.toml
      const clusterSection = cluster === "mainnet" ? "mainnet" : cluster;
      const match = anchorToml.match(new RegExp(`\\[programs\\.${clusterSection}\\][\\s\\S]*?cloak_gatekeeper\\s*=\\s*"([A-Za-z0-9]{32,44})"`));
      deployedProgramId = match ? match[1] : currentProgramId;
    }
  } catch {
    deployedProgramId = currentProgramId;
  }

  console.error(`[deploy-gk] Deployed program ID: ${deployedProgramId}`);

  const rpc = cluster === "devnet" 
    ? "https://api.devnet.solana.com" 
    : cluster === "mainnet" 
      ? "https://api.mainnet-beta.solana.com"
      : "http://127.0.0.1:8899";
      
  const connection = new Connection(rpc, "confirmed");
  const acct = await connection.getAccountInfo(new PublicKey(deployedProgramId));
  if (!acct || !acct.executable) {
    console.error("[deploy-gk] post-deploy verification failed (program not executable)");
    process.exit(1);
  }

  // Update configuration files with new program ID
  console.error("[deploy-gk] Updating configuration files...");
  
  // 1. Update declare_id! in lib.rs
  updateFile(
    libRsPath,
    /declare_id!\("[A-Za-z0-9]{32,44}"\)/,
    `declare_id!("${deployedProgramId}")`,
    "declare_id! in lib.rs"
  );

  // 2. Update Anchor.toml for all clusters
  const tomlPattern = new RegExp(`(\\[programs\\.[^\\]]+\\][\\s\\S]*?cloak_gatekeeper\\s*=\\s*")[A-Za-z0-9]{32,44}(")`, "g");
  updateFile(
    anchorTomlPath,
    tomlPattern,
    `$1${deployedProgramId}$2`,
    "Anchor.toml"
  );

  // 3. Update .env.example
  updateFile(
    ".env.example",
    /NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=[A-Za-z0-9]{32,44}/,
    `NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=${deployedProgramId}`,
    ".env.example"
  );

  // 4. Update apps/web/.env.local if it exists
  const webEnvPath = "apps/web/.env.local";
  if (existsSync(webEnvPath)) {
    updateFile(
      webEnvPath,
      /NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=[A-Za-z0-9]{32,44}/,
      `NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=${deployedProgramId}`,
      "apps/web/.env.local"
    );
  }

  // 5. Rebuild to generate updated IDL
  console.error("[deploy-gk] Rebuilding with updated program ID...");
  const rebuild = spawnSync("anchor", ["build", "-p", "cloak_gatekeeper"], {
    stdio: "inherit",
    env: { ...process.env, NO_DNA: "1" },
  });
  if (rebuild.status !== 0) {
    console.error("[deploy-gk] Warning: rebuild failed, but deploy succeeded");
  }

  console.error("[deploy-gk] ✅ Success!");
  console.error(`  Program ID:     ${deployedProgramId}`);
  console.error(`  Owner:          ${acct.owner.toBase58()}`);
  console.error(`  Size (bytes):   ${acct.data.length}`);
  console.error(`  Cluster:        ${cluster}`);
  console.error("");
  console.error("Next steps:");
  console.error("  1. Update your apps/web/.env.local with the new program ID");
  console.error("  2. Restart the Next.js dev server");
  console.error("  3. Test the deployment");
}

main().catch((err) => {
  console.error("[deploy-gk] failed:", err);
  process.exit(1);
});

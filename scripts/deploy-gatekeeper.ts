/**
 * Deploy wrapper for cloak_gatekeeper.
 *
 * Usage:
 *   pnpm deploy:gk -- --cluster devnet
 *   pnpm deploy:gk -- --cluster localnet
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { Connection, PublicKey } from "@solana/web3.js";

const GATEKEEPER_PROGRAM_ID = new PublicKey("WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J");

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

async function main() {
  const cluster = getArg("--cluster");
  if (!cluster || !["devnet", "localnet"].includes(cluster)) {
    console.error("Usage: deploy-gatekeeper.ts --cluster devnet|localnet");
    process.exit(1);
  }

  const wallet = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  if (!existsSync(wallet)) {
    console.error(`Wallet not found: ${wallet}`);
    process.exit(1);
  }

  const ok = await confirm(`Deploy cloak_gatekeeper to ${cluster}? (y/N)`);
  if (!ok) {
    console.error("Aborted.");
    process.exit(1);
  }

  console.error(`[deploy-gk] Building cloak_gatekeeper`);
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

  const rpc =
    cluster === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899";
  const connection = new Connection(rpc, "confirmed");
  const acct = await connection.getAccountInfo(GATEKEEPER_PROGRAM_ID);
  if (!acct || !acct.executable) {
    console.error("[deploy-gk] post-deploy verification failed (program not executable)");
    process.exit(1);
  }

  console.error("[deploy-gk] success");
  console.error(`  program ID:    ${GATEKEEPER_PROGRAM_ID.toBase58()}`);
  console.error(`  owner:         ${acct.owner.toBase58()}`);
  console.error(`  size (bytes):  ${acct.data.length}`);
}

main().catch((err) => {
  console.error("[deploy-gk] failed:", err);
  process.exit(1);
});

/**
 * Deploy wrapper for cloak_mock (devnet/localnet only).
 *
 * Usage:
 *   pnpm deploy:mock -- --cluster devnet
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { Connection, PublicKey } from "@solana/web3.js";

const CLOAK_MOCK_PROGRAM_ID = new PublicKey("2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe");

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
  if (cluster === "mainnet") {
    console.error("cloak_mock is devnet-only; mainnet deploy is forbidden.");
    process.exit(1);
  }
  if (!cluster || !["devnet", "localnet"].includes(cluster)) {
    console.error("Usage: deploy-cloak-mock.ts --cluster devnet|localnet");
    process.exit(1);
  }

  const wallet = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  if (!existsSync(wallet)) {
    console.error(`Wallet not found: ${wallet}`);
    process.exit(1);
  }

  const ok = await confirm(`Deploy cloak_mock to ${cluster}? (y/N)`);
  if (!ok) {
    console.error("Aborted.");
    process.exit(1);
  }

  console.error("[deploy-mock] Building cloak_mock");
  const build = spawnSync("anchor", ["build", "-p", "cloak_mock"], {
    stdio: "inherit",
    env: { ...process.env, NO_DNA: "1" },
  });
  if (build.status !== 0) {
    process.exit(1);
  }

  console.error(`[deploy-mock] Deploying to ${cluster}`);
  const deploy = spawnSync(
    "anchor",
    ["deploy", "--provider.cluster", cluster, "-p", "cloak_mock"],
    { stdio: "inherit" },
  );
  if (deploy.status !== 0) {
    process.exit(1);
  }

  const rpc = cluster === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899";
  const connection = new Connection(rpc, "confirmed");
  const acct = await connection.getAccountInfo(CLOAK_MOCK_PROGRAM_ID);
  if (!acct || !acct.executable) {
    console.error("[deploy-mock] post-deploy verification failed");
    process.exit(1);
  }

  console.error("[deploy-mock] success");
  console.error(`  program ID:   ${CLOAK_MOCK_PROGRAM_ID.toBase58()}`);
  console.error(`  size (bytes): ${acct.data.length}`);
}

main().catch((err) => {
  console.error("[deploy-mock] failed:", err);
  process.exit(1);
});

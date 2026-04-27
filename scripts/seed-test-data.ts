/**
 * Seed test data — idempotent + on-chain reset detection.
 *
 * Usage:
 *   pnpm seed:demo           # idempotent (no-op if state exists)
 *   pnpm seed:reset          # nuke + regenerate
 *
 * Outputs .demo-data.json (gitignored) with all created IDs/PDAs.
 *
 * Per docs.cloak.ag/development/devnet: Solana devnet is reset periodically.
 * If cofre PDA disappears on-chain, this script auto-regenerates.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(REPO_ROOT, ".demo-data.json");

type DemoData = {
  cofreAddress: string;
  multisigPda: string;
  viewDistributionPda: string;
  mockPoolPda: string;
  proposalDraftIds: string[];
  auditLinkIds: string[];
  stealthInvoiceId: string;
};

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const isReset = process.argv.includes("--reset");

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const prisma = new PrismaClient();

  if (isReset) {
    console.log("[seed] --reset: wiping DB + .demo-data.json");
    if (existsSync(OUT_FILE)) unlinkSync(OUT_FILE);
    execSync("pnpm --filter web exec prisma migrate reset --force --skip-seed", {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
  }

  let existing: DemoData | null = null;
  if (existsSync(OUT_FILE)) {
    existing = JSON.parse(readFileSync(OUT_FILE, "utf-8")) as DemoData;
    const cofreAccount = await connection.getAccountInfo(new PublicKey(existing.cofreAddress));
    if (!cofreAccount) {
      console.log("[seed] devnet appears to have been reset; cofre PDA is gone. Regenerating.");
      existing = null;
      if (existsSync(OUT_FILE)) unlinkSync(OUT_FILE);
    } else {
      const dbExists = await prisma.proposalDraft.findFirst({
        where: { id: existing.proposalDraftIds[0] },
      });
      if (dbExists) {
        console.log("[seed] state intact — no-op. Use --reset to regenerate.");
        await prisma.$disconnect();
        return;
      }
      console.log("[seed] on-chain OK but DB missing rows; re-seeding DB drafts.");
    }
  }

  console.log("[seed] running setup-demo-cofre.ts to create on-chain fixtures");
  execSync("pnpm tsx scripts/setup-demo-cofre.ts", { cwd: REPO_ROOT, stdio: "inherit" });

  const cofreFile = path.join(REPO_ROOT, "scripts/.demo-cofre.json");
  if (!existsSync(cofreFile)) {
    throw new Error(`Expected ${cofreFile} from setup-demo-cofre.ts; got nothing.`);
  }
  const cofreData = JSON.parse(readFileSync(cofreFile, "utf-8"));

  const cofreAddress = cofreData.cofrePda as string;
  const multisigPda = cofreData.multisigPda as string;
  const viewDistributionPda = cofreData.viewDistributionPda as string;
  const mockPoolPda = cofreData.mockPoolPda ?? "";

  console.log("[seed] creating Prisma drafts");

  const draft1 = await prisma.proposalDraft.create({
    data: {
      cofreAddress,
      transactionIndex: "1",
      amount: "100000",
      recipient: Keypair.generate().publicKey.toBase58(),
      memo: "demo single tx",
      payloadHash: Buffer.alloc(32, 1),
      invariants: JSON.stringify({ kind: "single" }),
    },
  });

  const payrollDraft = await prisma.payrollDraft.create({
    data: {
      cofreAddress,
      transactionIndex: "2",
      memo: "demo payroll",
      totalAmount: "300000",
      recipientCount: 3,
      recipients: {
        create: [
          { name: "Alice", wallet: Keypair.generate().publicKey.toBase58(), amount: "100000", payloadHash: Buffer.alloc(32, 2), invariants: "{}" },
          { name: "Bob", wallet: Keypair.generate().publicKey.toBase58(), amount: "100000", payloadHash: Buffer.alloc(32, 3), invariants: "{}" },
          { name: "Carol", wallet: Keypair.generate().publicKey.toBase58(), amount: "100000", payloadHash: Buffer.alloc(32, 4), invariants: "{}" },
        ],
      },
    },
  });
  // Mirror the payroll as a ProposalDraft for unified UI listing
  const draft2 = await prisma.proposalDraft.create({
    data: {
      cofreAddress,
      transactionIndex: "2",
      amount: "300000",
      recipient: "(payroll)",
      memo: "demo payroll",
      payloadHash: Buffer.alloc(32, 5),
      invariants: JSON.stringify({ kind: "payroll", payrollDraftId: payrollDraft.id }),
    },
  });

  const draft3 = await prisma.proposalDraft.create({
    data: {
      cofreAddress,
      transactionIndex: "3",
      amount: "50000",
      recipient: Keypair.generate().publicKey.toBase58(),
      memo: "INV-2026-Q2-001",
      payloadHash: Buffer.alloc(32, 6),
      invariants: JSON.stringify({ kind: "single", memoTagged: true }),
    },
  });

  const issuer = Keypair.generate().publicKey.toBase58();

  const audit1 = await prisma.auditLink.create({
    data: {
      cofreAddress,
      diversifier: Buffer.alloc(32, 7),
      scope: "time_ranged",
      scopeParams: JSON.stringify({ startDate: 1700000000, endDate: 1800000000 }),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      issuedBy: issuer,
      signature: Buffer.alloc(64, 8),
    },
  });

  const audit2 = await prisma.auditLink.create({
    data: {
      cofreAddress,
      diversifier: Buffer.alloc(32, 9),
      scope: "amounts_only",
      scopeParams: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      issuedBy: issuer,
      signature: Buffer.alloc(64, 10),
    },
  });

  const stealthKeypair = Keypair.generate();
  const stealthInvoice = await prisma.stealthInvoice.create({
    data: {
      cofreAddress,
      recipientWallet: Keypair.generate().publicKey.toBase58(),
      invoiceRef: "INV-DEMO-001",
      memo: "demo stealth invoice",
      stealthPubkey: stealthKeypair.publicKey.toBase58(),
      amountHintEncrypted: Buffer.alloc(48, 11),
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const out: DemoData = {
    cofreAddress,
    multisigPda,
    viewDistributionPda,
    mockPoolPda,
    proposalDraftIds: [draft1.id, draft2.id, draft3.id],
    auditLinkIds: [audit1.id, audit2.id],
    stealthInvoiceId: stealthInvoice.id,
  };

  writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`[seed] done. Wrote ${OUT_FILE}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});

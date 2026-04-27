/**
 * Compliance export — generate CSV of audit data for a given cofre.
 *
 * Usage:
 *   pnpm tsx scripts/compliance-export.ts <cofreAddress>
 *   pnpm tsx scripts/compliance-export.ts <cofreAddress> --output report.csv
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  type AuditScope,
  type FilteredAuditTransaction,
  exportAuditToCSV,
  filterAuditData,
} from "@cloak-squads/core";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: compliance-export.ts <cofreAddress> [--output file.csv]");
    process.exit(1);
  }

  const cofreAddress = args[0];
  const outputIdx = args.indexOf("--output");
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

  const prisma = new PrismaClient();

  const links = await prisma.auditLink.findMany({
    where: { cofreAddress },
    orderBy: { createdAt: "asc" },
  });

  if (links.length === 0) {
    console.error(`No audit links found for cofre ${cofreAddress}.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const allRows: string[] = [];
  let headerEmitted = false;

  for (const link of links) {
    // For demo purposes, generate empty filtered set (real txs come from Cloak scan).
    // Real implementation would call cloak-scan API with derived view key.
    const txs: FilteredAuditTransaction[] = [];
    const scope = link.scope as AuditScope;
    const params = link.scopeParams ? JSON.parse(link.scopeParams) : undefined;
    const filtered = filterAuditData(txs, scope, params);

    const csv = exportAuditToCSV(filtered);
    const lines = csv.split("\n");
    if (!headerEmitted) {
      allRows.push(lines[0]);
      headerEmitted = true;
    }
    if (lines.length > 1) allRows.push(...lines.slice(1).filter(Boolean));
  }

  const out = `${allRows.join("\n")}\n`;
  if (outputPath) {
    writeFileSync(outputPath, out);
    console.error(`[compliance-export] wrote ${outputPath} (${allRows.length} rows incl. header)`);
  } else {
    process.stdout.write(out);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[compliance-export] failed:", err);
  process.exit(1);
});

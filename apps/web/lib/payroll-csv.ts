import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { solToLamports } from "@/lib/sol";

const MAX_U64 = "18446744073709551615";

function isValidSolanaAddress(address: string): boolean {
  try {
    const pk = new PublicKey(address);
    return PublicKey.isOnCurve(pk.toBytes());
  } catch {
    return false;
  }
}

export const payrollRecipientSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  wallet: z.string().refine(isValidSolanaAddress, {
    message: "Invalid Solana wallet address",
  }),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a number in SOL (e.g. 2 or 0.5)").refine(
    (val) => {
      try {
        const lamports = BigInt(solToLamports(val));
        return lamports > 0n && lamports <= BigInt(MAX_U64);
      } catch {
        return false;
      }
    },
    { message: "Amount must be greater than 0 and fit in u64" },
  ),
  memo: z.string().max(200).optional(),
});

export const payrollCsvSchema = z.array(payrollRecipientSchema).min(1, "At least one recipient is required").max(10, "Maximum 10 recipients allowed in V1");

export type PayrollRecipientInput = z.infer<typeof payrollRecipientSchema>;
export type PayrollCsvInput = z.infer<typeof payrollCsvSchema>;

export function parsePayrollCsv(csvText: string): { data: PayrollRecipientInput[] | null; errors: string[] } {
  const lines = csvText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { data: null, errors: ["Empty CSV file"] };
  }

  // Check if first line is a header
  const firstLine = lines[0]!;
  const hasHeader = firstLine.toLowerCase().includes("name") || firstLine.toLowerCase().includes("wallet") || firstLine.toLowerCase().includes("amount");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  if (dataLines.length === 0) {
    return { data: null, errors: ["No data rows found after header"] };
  }

  const recipients: PayrollRecipientInput[] = [];
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i]!;
    const rowNum = hasHeader ? i + 2 : i + 1;

    // Try comma-separated first, then semicolon
    let parts = line.split(",").map((p) => p.trim());
    if (parts.length < 3) {
      parts = line.split(";").map((p) => p.trim());
    }

    if (parts.length < 3) {
      errors.push(`Row ${rowNum}: Expected at least 3 columns (name, wallet, amount), got ${parts.length}`);
      continue;
    }

    const [name, wallet, amount, memo] = parts;
    const parsed = payrollRecipientSchema.safeParse({ name, wallet, amount, memo });

    if (!parsed.success) {
      const errorMessages = Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .join("; ");
      errors.push(`Row ${rowNum}: ${errorMessages}`);
      continue;
    }

    // Convert SOL → lamports so the rest of the app always works in lamports
    recipients.push({ ...parsed.data, amount: solToLamports(parsed.data.amount) });
  }

  if (recipients.length === 0) {
    return { data: null, errors };
  }

  // Check for duplicate wallets
  const walletSet = new Set<string>();
  const duplicates: string[] = [];
  for (const r of recipients) {
    if (walletSet.has(r.wallet)) {
      duplicates.push(r.wallet);
    } else {
      walletSet.add(r.wallet);
    }
  }
  if (duplicates.length > 0) {
    errors.push(`Duplicate wallets found: ${[...new Set(duplicates)].join(", ")}`);
  }

  if (recipients.length > 10) {
    errors.push(`Maximum 10 recipients allowed in V1. Found ${recipients.length}. Only the first 10 will be used.`);
    return { data: recipients.slice(0, 10), errors };
  }

  return { data: recipients, errors };
}

export function formatPayrollCsvTemplate(): string {
  return "name,wallet,amount,memo\nAlice,7SrukWUsDNwpqqtN2p8zAeQe9A689jVYFUi9gSfseWir,1,Monthly salary\nBob,BsPyL4w7vR8DsFxVK6RM4oDjzdNJt7eDfC9BnMRzLop3,0.5,Bonus";
}

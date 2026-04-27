import { z } from "zod";

export const payrollRecipientSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  wallet: z.string().min(32, "Invalid wallet address").max(44),
  amount: z.string().regex(/^\d+$/, "Amount must be a positive integer in lamports"),
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

    recipients.push(parsed.data);
  }

  if (recipients.length === 0) {
    return { data: null, errors };
  }

  if (recipients.length > 10) {
    errors.push(`Maximum 10 recipients allowed in V1. Found ${recipients.length}. Only the first 10 will be used.`);
    return { data: recipients.slice(0, 10), errors };
  }

  return { data: recipients, errors };
}

export function formatPayrollCsvTemplate(): string {
  return "name,wallet,amount,memo\nAlice,7nY7H...abc,1000000,Monthly salary\nBob,8oZ8I...def,2000000,Bonus";
}

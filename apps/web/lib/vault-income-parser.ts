import type { ParsedInstruction, ParsedTransactionWithMeta } from "@solana/web3.js";

/**
 * Pure income parser, lifted out of `vault-income-sync.ts` so it can be unit
 * tested without dragging in the Next.js + Prisma module graph. The sync helper
 * re-exports these for backward compatibility.
 */

export type ParsedIncome = {
  signature: string;
  amountLamports: bigint;
  fromAddress: string;
  blockTime: Date;
  vaultIndex: number;
  toLabel: string | null;
};

export type ParseRejection = {
  signature: string;
  reason:
    | "rpc_returned_null"
    | "tx_meta_missing"
    | "tx_failed"
    | "vault_not_in_accounts"
    | "balance_undefined"
    | "diff_too_small"
    | "diff_negative_or_zero";
  detail?: string;
};

export function parseIncome(
  tx: ParsedTransactionWithMeta,
  sigInfo: { signature: string; blockTime: number | null | undefined },
  vaultAddress: string,
  vaultIndex: number,
  toLabel: string | null,
  rejections?: ParseRejection[],
): ParsedIncome | null {
  if (!tx.meta) {
    rejections?.push({ signature: sigInfo.signature, reason: "tx_meta_missing" });
    return null;
  }
  if (tx.meta.err) {
    rejections?.push({
      signature: sigInfo.signature,
      reason: "tx_failed",
      detail: JSON.stringify(tx.meta.err),
    });
    return null;
  }

  const accounts = tx.transaction.message.accountKeys;
  const vaultIdx = accounts.findIndex((a) => a.pubkey.toBase58() === vaultAddress);
  if (vaultIdx === -1) {
    rejections?.push({
      signature: sigInfo.signature,
      reason: "vault_not_in_accounts",
      detail: `vault=${vaultAddress.slice(0, 8)}... accounts=[${accounts
        .map((a) => a.pubkey.toBase58().slice(0, 8))
        .join(",")}]`,
    });
    return null;
  }

  const pre = tx.meta.preBalances[vaultIdx];
  const post = tx.meta.postBalances[vaultIdx];
  if (pre === undefined || post === undefined) {
    rejections?.push({ signature: sigInfo.signature, reason: "balance_undefined" });
    return null;
  }
  const diff = post - pre;
  if (diff <= 0) {
    rejections?.push({
      signature: sigInfo.signature,
      reason: "diff_negative_or_zero",
      detail: `diff=${diff}`,
    });
    return null;
  }
  if (diff < 100_000) {
    rejections?.push({
      signature: sigInfo.signature,
      reason: "diff_too_small",
      detail: `diff=${diff}`,
    });
    return null;
  }

  let from = "Unknown";
  let amountLamports = BigInt(diff);

  // Top-level System.transfer covers external deposits (a wallet sends SOL
  // straight to the vault PDA). Internal sub-vault → vault moves go through
  // Squads.vaultTransactionExecute, where the System.transfer is a CPI living
  // in tx.meta.innerInstructions. We scan top-level first (cheap, common),
  // then fall back to inner instructions so the source is recovered for
  // internal flows instead of staying "Unknown".
  const matchTransfer = (ix: unknown): boolean => {
    if (!ix || typeof ix !== "object" || !("parsed" in ix)) return false;
    const pix = ix as ParsedInstruction;
    if (pix.program !== "system") return false;
    const parsed = pix.parsed as
      | { type?: string; info?: { destination?: string; source?: string; lamports?: number } }
      | undefined;
    if (parsed?.type !== "transfer") return false;
    if (parsed.info?.destination !== vaultAddress) return false;
    from = parsed.info.source ?? "Unknown";
    if (parsed.info.lamports !== undefined) amountLamports = BigInt(parsed.info.lamports);
    return true;
  };

  let matched = false;
  for (const ix of tx.transaction.message.instructions) {
    if (matchTransfer(ix)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    for (const inner of tx.meta.innerInstructions ?? []) {
      for (const ix of inner.instructions) {
        if (matchTransfer(ix)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  return {
    signature: sigInfo.signature,
    amountLamports,
    fromAddress: from,
    blockTime: new Date((sigInfo.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
    vaultIndex,
    toLabel,
  };
}

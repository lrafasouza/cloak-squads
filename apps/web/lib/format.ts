/**
 * Consistent number / currency / amount formatters.
 *
 * Why: the audit found ad-hoc `toLocaleString(...)` calls scattered across
 * the codebase with slightly different precision, fraction-digit, and
 * locale choices. Result: a SOL amount on one page reads `1.2345 SOL` and
 * the same value on another reads `1.23 SOL`. Pull every numeric display
 * through this module so locale + precision become one decision per type,
 * not one decision per component.
 *
 * Defaults assume USD / en-US. Localisation is intentionally NOT plumbed
 * yet — when it lands, swap the constant locale here once and every call
 * site picks it up.
 */

const LOCALE = "en-US";
const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Format lamports as a SOL string with up to N fraction digits (default 4). */
export function formatSol(lamports: bigint | number, fractionDigits = 4): string {
  const lam = typeof lamports === "bigint" ? lamports : BigInt(Math.trunc(lamports));
  // BigInt → decimal string. Pad to at least 9 digits, then insert the decimal
  // point. This avoids float precision loss for big balances.
  const negative = lam < 0n;
  const abs = negative ? -lam : lam;
  const whole = abs / LAMPORTS_PER_SOL;
  const frac = abs % LAMPORTS_PER_SOL;
  const fracStr = frac.toString().padStart(9, "0");
  const wholeStr = whole.toString();
  const trimmed = fracStr.slice(0, Math.max(0, fractionDigits)).replace(/0+$/, "") || "";
  const wholeFmt = Number(wholeStr).toLocaleString(LOCALE);
  const sign = negative ? "-" : "";
  return trimmed ? `${sign}${wholeFmt}.${trimmed}` : `${sign}${wholeFmt}`;
}

/** Format an integer token amount given the mint's `decimals`. */
export function formatToken(
  rawUnits: bigint | number,
  decimals: number,
  options?: { symbol?: string; maxFractionDigits?: number },
): string {
  const raw = typeof rawUnits === "bigint" ? rawUnits : BigInt(Math.trunc(rawUnits));
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const divisor = 10n ** BigInt(Math.max(0, decimals));
  const whole = abs / divisor;
  const frac = decimals > 0 ? abs % divisor : 0n;
  const fracStr = decimals > 0 ? frac.toString().padStart(decimals, "0") : "";
  const fractionDigits = options?.maxFractionDigits ?? Math.min(decimals, 6);
  const trimmed = fracStr.slice(0, Math.max(0, fractionDigits)).replace(/0+$/, "") || "";
  const wholeFmt = Number(whole.toString()).toLocaleString(LOCALE);
  const sign = negative ? "-" : "";
  const value = trimmed ? `${sign}${wholeFmt}.${trimmed}` : `${sign}${wholeFmt}`;
  return options?.symbol ? `${value} ${options.symbol}` : value;
}

/** Format a USD amount as a currency string. */
export function formatUsd(amount: number, fractionDigits = 2): string {
  if (!Number.isFinite(amount)) return "$0.00";
  return amount.toLocaleString(LOCALE, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Format a 0–1 ratio as a percent string (`0.123` → "12.3%"). */
export function formatPercent(ratio: number, fractionDigits = 2): string {
  if (!Number.isFinite(ratio)) return "0%";
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/** Abbreviate large counts (`12345` → "12.3K"). Best for table cells. */
export function formatCompact(n: number, fractionDigits = 1): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(LOCALE, {
    notation: "compact",
    maximumFractionDigits: fractionDigits,
  });
}

/** Truncate a Solana pubkey for display (`AbCd...XyZ`). */
export function truncatePubkey(pubkey: string, head = 4, tail = 4): string {
  if (pubkey.length <= head + tail + 1) return pubkey;
  return `${pubkey.slice(0, head)}…${pubkey.slice(-tail)}`;
}

export const minimumVaultTopUpLamports = 20_000_000n;

export function vaultTopUpLamportsNeeded(currentLamports: bigint) {
  if (currentLamports >= minimumVaultTopUpLamports) return 0n;
  return minimumVaultTopUpLamports - currentLamports;
}

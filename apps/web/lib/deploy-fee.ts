import type { Connection } from "@solana/web3.js";

export const SQUADS_PROTOCOL_FEE_LAMPORTS = 1_000;
export const AEGIS_REGISTRATION_FEE_LAMPORTS = 1_000;
export const VAULT_RENT_RESERVE_LAMPORTS = 20_000_000;

export interface DeployFeeBreakdown {
  squadsProtocolFeeLamports: number;
  aegisRegistrationFeeLamports: number;
  vaultRentReserveLamports: number;
  estimatedNetworkRentLamports: number;
  estimatedTransactionFeeLamports: number;
  totalLamports: number;
}

export async function estimateDeployFee(connection: Connection): Promise<DeployFeeBreakdown> {
  const emptyAccountRent = await connection.getMinimumBalanceForRentExemption(0).catch(() => 0);
  const estimatedNetworkRentLamports = emptyAccountRent * 4;
  const estimatedTransactionFeeLamports = 5_000;
  const totalLamports =
    SQUADS_PROTOCOL_FEE_LAMPORTS +
    AEGIS_REGISTRATION_FEE_LAMPORTS +
    VAULT_RENT_RESERVE_LAMPORTS +
    estimatedNetworkRentLamports +
    estimatedTransactionFeeLamports;

  return {
    squadsProtocolFeeLamports: SQUADS_PROTOCOL_FEE_LAMPORTS,
    aegisRegistrationFeeLamports: AEGIS_REGISTRATION_FEE_LAMPORTS,
    vaultRentReserveLamports: VAULT_RENT_RESERVE_LAMPORTS,
    estimatedNetworkRentLamports,
    estimatedTransactionFeeLamports,
    totalLamports,
  };
}

"use client";

import { SOL_MINT, USDC_DECIMALS, USDC_MINT, formatTokenAmount } from "@/lib/tokens";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import { useQuery } from "@tanstack/react-query";

export const SOL_TOKEN = {
  mint: SOL_MINT,
  symbol: "SOL",
  decimals: 9,
  balance: 0n,
  uiBalance: "0",
  ataAddress: null as string | null,
};

export type VaultToken = typeof SOL_TOKEN;

export function useVaultTokens(multisig: string) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["vault-tokens", multisig],
    enabled: !!multisig,
    staleTime: 30_000,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "hidden" ? false : 30_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<VaultToken[]> => {
      const multisigPk = new PublicKey(multisig);
      const [vaultPda] = multisigSdk.getVaultPda({ multisigPda: multisigPk, index: 0 });
      const usdcMint = new PublicKey(USDC_MINT);
      const vaultUsdcAta = await getAssociatedTokenAddress(usdcMint, vaultPda, true);

      const [solBalance, usdcAtaInfo] = await Promise.all([
        connection.getBalance(vaultPda, "confirmed"),
        connection.getAccountInfo(vaultUsdcAta),
      ]);

      const solToken: VaultToken = {
        mint: SOL_MINT,
        symbol: "SOL",
        decimals: 9,
        balance: BigInt(solBalance),
        uiBalance: formatTokenAmount(BigInt(solBalance), 9),
        ataAddress: null,
      };

      let usdcRaw = 0n;
      if (usdcAtaInfo?.data) {
        const buf = Buffer.from(usdcAtaInfo.data);
        if (buf.length >= 72) usdcRaw = buf.readBigUInt64LE(64);
      }

      const usdcToken: VaultToken = {
        mint: USDC_MINT,
        symbol: "USDC",
        decimals: USDC_DECIMALS,
        balance: usdcRaw,
        uiBalance: formatTokenAmount(usdcRaw, USDC_DECIMALS),
        ataAddress: usdcRaw > 0n ? vaultUsdcAta.toBase58() : null,
      };

      return [solToken, usdcToken];
    },
  });
}

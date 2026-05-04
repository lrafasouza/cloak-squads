"use client";

import { publicEnv } from "@/lib/env";
import { lamportsToSol } from "@/lib/sol";
import { USDC_DECIMALS, USDC_MINT, formatTokenAmount } from "@/lib/tokens";
import { cofrePda, squadsVaultPda } from "@cloak-squads/core/pda";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface VaultData {
  balanceLamports: number;
  balanceSol: string;
  usdcRaw: bigint;
  usdcUi: string;
  threshold: number;
  memberCount: number;
  members: string[];
  cofreInitialized: boolean;
}

export function useVaultData(multisig: string) {
  const { connection } = useConnection();

  const gatekeeperProgramId = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
    [],
  );
  const squadsProgram = useMemo(() => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID), []);

  return useQuery({
    queryKey: ["vault-data", multisig],
    enabled: !!multisig,
    staleTime: 30_000,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "hidden" ? false : 20_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<VaultData> => {
      const multisigPk = new PublicKey(multisig);
      const [vaultPda] = squadsVaultPda(multisigPk, squadsProgram);
      const [cofreAddress] = cofrePda(multisigPk, gatekeeperProgramId);
      const usdcMint = new PublicKey(USDC_MINT);
      const vaultUsdcAta = await getAssociatedTokenAddress(usdcMint, vaultPda, true);

      const [ms, accountInfos] = await Promise.all([
        multisigSdk.accounts.Multisig.fromAccountAddress(connection, multisigPk),
        connection.getMultipleAccountsInfo([vaultPda, cofreAddress, vaultUsdcAta]),
      ]);
      const [vaultAccount, cofreAccount, usdcAtaAccount] = accountInfos;

      const balanceLamports = vaultAccount?.lamports ?? 0;

      let usdcRaw = 0n;
      if (usdcAtaAccount?.data) {
        // Token account layout: amount is at byte offset 64, 8 bytes little-endian
        const buf = Buffer.from(usdcAtaAccount.data);
        if (buf.length >= 72) usdcRaw = buf.readBigUInt64LE(64);
      }

      return {
        balanceLamports,
        balanceSol: lamportsToSol(String(balanceLamports)),
        usdcRaw,
        usdcUi: formatTokenAmount(usdcRaw, USDC_DECIMALS),
        threshold: ms.threshold,
        memberCount: ms.members.length,
        members: ms.members.map((m) => m.key.toBase58()),
        cofreInitialized: !!cofreAccount && cofreAccount.owner.equals(gatekeeperProgramId),
      };
    },
  });
}

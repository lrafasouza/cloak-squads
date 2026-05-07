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

export interface SubVaultBalance {
  name: string;
  vaultIndex: number;
  /** Base58 PDA derived for this sub-vault, surfaced so callers don't need to
   *  re-derive when comparing addresses (e.g. internal-vs-external KPI filter). */
  address: string;
  balanceSol: string;
  usdcUi: string;
}

export interface VaultData {
  balanceLamports: number;
  balanceSol: string;
  primaryBalanceSol: string;
  /** Base58 of the primary vault PDA. Same role as `SubVaultBalance.address` but
   *  for `vaultIndex = 0`. */
  primaryVaultAddress: string;
  usdcRaw: bigint;
  usdcUi: string;
  subVaultBreakdown: SubVaultBalance[];
  threshold: number;
  memberCount: number;
  members: string[];
  cofreInitialized: boolean;
  /** Required wait between proposal approval and execution, in seconds. 0 = disabled. */
  timeLock: number;
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
    retry: 3,
    retryDelay: 1500,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "hidden" ? false : 20_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<VaultData> => {
      const multisigPk = new PublicKey(multisig);
      const [primaryVaultPda] = squadsVaultPda(multisigPk, squadsProgram, 0);
      const [cofreAddress] = cofrePda(multisigPk, gatekeeperProgramId);
      const usdcMint = new PublicKey(USDC_MINT);

      // Fetch sub-vault indices from DB (no auth needed for GET)
      let subVaultEntries: Array<{ vaultIndex: number; name: string }> = [];
      try {
        const svRes = await fetch(`/api/vaults/${multisig}/sub-vaults`);
        if (svRes.ok) subVaultEntries = await svRes.json();
      } catch {}

      // Derive sub-vault PDAs
      const subVaultMeta = subVaultEntries.map((sv) => ({
        name: sv.name,
        vaultIndex: sv.vaultIndex,
        pda: squadsVaultPda(multisigPk, squadsProgram, sv.vaultIndex)[0],
      }));

      // Derive all USDC ATAs in one pass
      const allUsdcAtas = await Promise.all([
        getAssociatedTokenAddress(usdcMint, primaryVaultPda, true),
        ...subVaultMeta.map((sv) => getAssociatedTokenAddress(usdcMint, sv.pda, true)),
      ]);
      const primaryUsdcAta = allUsdcAtas[0]!;
      const svUsdcAtas = allUsdcAtas.slice(1);

      // Build one batch: [primaryVault, cofreAddr, primaryUsdcAta, sv0Pda, sv0Usdc, sv1Pda, sv1Usdc, ...]
      const batchAddresses: PublicKey[] = [
        primaryVaultPda,
        cofreAddress,
        primaryUsdcAta,
        ...subVaultMeta.flatMap((sv, i) => [sv.pda, svUsdcAtas[i]!]),
      ];

      const [ms, accountInfos] = await Promise.all([
        multisigSdk.accounts.Multisig.fromAccountAddress(connection, multisigPk),
        connection.getMultipleAccountsInfo(batchAddresses),
      ]);

      const [vaultAccount, cofreAccount, primaryUsdcAccount, ...rest] = accountInfos;

      const primaryLamports = vaultAccount?.lamports ?? 0;
      let primaryUsdcRaw = 0n;
      if (primaryUsdcAccount?.data) {
        const buf = Buffer.from(primaryUsdcAccount.data);
        if (buf.length >= 72) primaryUsdcRaw = buf.readBigUInt64LE(64);
      }

      // Aggregate sub-vault balances (pairs of [svPda, svUsdcAta] in `rest`)
      let subLamports = 0;
      let subUsdcRaw = 0n;
      const subVaultBreakdown: SubVaultBalance[] = [];

      for (const [i, sv] of subVaultMeta.entries()) {
        const svAccount = rest[i * 2] ?? null;
        const svUsdcAccount = rest[i * 2 + 1] ?? null;
        const svLamports = svAccount?.lamports ?? 0;
        let svUsdc = 0n;
        if (svUsdcAccount?.data) {
          const buf = Buffer.from(svUsdcAccount.data);
          if (buf.length >= 72) svUsdc = buf.readBigUInt64LE(64);
        }
        subLamports += svLamports;
        subUsdcRaw += svUsdc;
        subVaultBreakdown.push({
          name: sv.name,
          vaultIndex: sv.vaultIndex,
          address: sv.pda.toBase58(),
          balanceSol: lamportsToSol(String(svLamports)),
          usdcUi: formatTokenAmount(svUsdc, USDC_DECIMALS),
        });
      }

      const totalLamports = primaryLamports + subLamports;
      const totalUsdcRaw = primaryUsdcRaw + subUsdcRaw;

      return {
        balanceLamports: totalLamports,
        balanceSol: lamportsToSol(String(totalLamports)),
        primaryBalanceSol: lamportsToSol(String(primaryLamports)),
        primaryVaultAddress: primaryVaultPda.toBase58(),
        usdcRaw: totalUsdcRaw,
        usdcUi: formatTokenAmount(totalUsdcRaw, USDC_DECIMALS),
        subVaultBreakdown,
        threshold: ms.threshold,
        memberCount: ms.members.length,
        members: ms.members.map((m) => m.key.toBase58()),
        cofreInitialized: !!cofreAccount && cofreAccount.owner.equals(gatekeeperProgramId),
        timeLock: ms.timeLock,
      };
    },
  });
}

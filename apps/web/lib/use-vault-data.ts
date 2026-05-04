"use client";

import { publicEnv } from "@/lib/env";
import { lamportsToSol } from "@/lib/sol";
import { cofrePda, squadsVaultPda } from "@cloak-squads/core/pda";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface VaultData {
  balanceLamports: number;
  balanceSol: string;
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
  const squadsProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID),
    [],
  );

  return useQuery({
    queryKey: ["vault-data", multisig],
    enabled: !!multisig,
    staleTime: 30_000,
    // Pause polling when tab is hidden to avoid burning RPC quota in background tabs.
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "hidden" ? false : 20_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<VaultData> => {
      const multisigPk = new PublicKey(multisig);
      const [vaultPda] = squadsVaultPda(multisigPk, squadsProgram);
      const [cofreAddress] = cofrePda(multisigPk, gatekeeperProgramId);

      const [ms, accountInfos] = await Promise.all([
        multisigSdk.accounts.Multisig.fromAccountAddress(connection, multisigPk),
        connection.getMultipleAccountsInfo([vaultPda, cofreAddress]),
      ]);
      const [vaultAccount, cofreAccount] = accountInfos;

      const balanceLamports = vaultAccount?.lamports ?? 0;

      return {
        balanceLamports,
        balanceSol: lamportsToSol(String(balanceLamports)),
        threshold: ms.threshold,
        memberCount: ms.members.length,
        members: ms.members.map((m) => m.key.toBase58()),
        cofreInitialized: !!cofreAccount && cofreAccount.owner.equals(gatekeeperProgramId),
      };
    },
  });
}

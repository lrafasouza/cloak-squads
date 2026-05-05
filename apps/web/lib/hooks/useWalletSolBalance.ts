"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect, useState } from "react";

// Squads VaultTransactionCreate + ProposalCreate rent + tx fee for a typical
// multi-ix proposal is around 0.0073 SOL. Threshold gives a small buffer so we
// warn before the user hits the actual on-chain failure.
export const PROPOSAL_RENT_THRESHOLD_SOL = 0.01;

export function useWalletSolBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [lamports, setLamports] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setLamports(null);
      return;
    }
    let cancelled = false;
    const fetchBalance = async () => {
      try {
        const bal = await connection.getBalance(publicKey, "confirmed");
        if (!cancelled) setLamports(bal);
      } catch {
        if (!cancelled) setLamports(null);
      }
    };
    fetchBalance();
    const interval = setInterval(fetchBalance, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection, publicKey]);

  const sol = lamports != null ? lamports / LAMPORTS_PER_SOL : null;
  const insufficientForProposal = sol != null && sol < PROPOSAL_RENT_THRESHOLD_SOL;

  return { lamports, sol, insufficientForProposal };
}

"use client";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { type ReactNode, useMemo } from "react";

function adapterNetworkFromEnv() {
  switch (process.env.NEXT_PUBLIC_SOLANA_CLUSTER) {
    case "mainnet-beta":
      return WalletAdapterNetwork.Mainnet;
    case "testnet":
      return WalletAdapterNetwork.Testnet;
    case "devnet":
    default:
      return WalletAdapterNetwork.Devnet;
  }
}

export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl(adapterNetworkFromEnv());

  // Empty array: @solana/wallet-adapter-react v0.15 auto-detects all installed wallets
  // that implement the Wallet Standard (Phantom, Backpack, Solflare, Coinbase, Glow, etc.)
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

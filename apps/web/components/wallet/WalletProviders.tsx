"use client";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider, useConnection } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { type ConnectionConfig, clusterApiUrl } from "@solana/web3.js";
import { type ReactNode, useEffect, useMemo } from "react";

// Pre-warm the RPC so wallets can resolve the cluster (via genesisHash)
// before the user's first signTransaction. Without this, the first send
// can race the wallet's network detection — Phantom/Backpack fall back
// to "Mainnet" when the probe hasn't completed, surfacing a misleading
// warning that disappears on refresh.
function ConnectionWarmup() {
  const { connection } = useConnection();
  useEffect(() => {
    connection.getGenesisHash().catch(() => {});
  }, [connection]);
  return null;
}

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
  // Helius needs the api-key on the WS URL too. web3.js derives wss from the
  // HTTP URL but strips query strings, so we pass it explicitly when set.
  const wsEndpoint = process.env.NEXT_PUBLIC_RPC_WS_URL;

  // ConnectionProvider's default is { commitment: 'confirmed' }. If we pass
  // any config, we MUST keep that — otherwise the Connection falls back to
  // 'finalized' for every method (getLatestBlockhash, simulateTransaction,
  // confirmTransaction) which silently regresses sendTransaction with stale
  // blockhashes (the symptom: WalletSendTransactionError on every send).
  const config = useMemo<ConnectionConfig>(
    () => ({ commitment: "confirmed", ...(wsEndpoint ? { wsEndpoint } : {}) }),
    [wsEndpoint],
  );

  // Empty array: @solana/wallet-adapter-react v0.15 auto-detects all installed wallets
  // that implement the Wallet Standard (Phantom, Backpack, Solflare, Coinbase, Glow, etc.)
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint} config={config}>
      <ConnectionWarmup />
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

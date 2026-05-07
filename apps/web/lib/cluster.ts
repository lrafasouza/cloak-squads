// Returns the Solana cluster the deployment is wired to. Used to scope DB rows
// (drafts, vaults, invoices, etc) so a row created on one cluster can't leak
// into a UI that's connected to another cluster.
//
// Reads NEXT_PUBLIC_SOLANA_CLUSTER directly because this helper runs in API
// route handlers — pulling from `publicEnv` would be fine too, but keeping the
// dependency surface tiny makes it safe to import from any server context.
export type Cluster = "devnet" | "mainnet-beta" | "testnet" | "localnet";

export function getCurrentCluster(): Cluster {
  const raw = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (raw === "mainnet-beta" || raw === "testnet" || raw === "localnet") return raw;
  return "devnet";
}

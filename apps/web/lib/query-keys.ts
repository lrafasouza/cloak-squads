/**
 * Central catalog of TanStack Query keys.
 *
 * Why: ad-hoc string keys (`["vault-data", multisig]`) sprinkled across the
 * codebase make cache invalidation fragile — a typo in `invalidateQueries`
 * silently no-ops. Pulling every key through this single registry lets
 * future-you grep for "queryKeys.vault.data" and find every call site at
 * once.
 *
 * Pattern: namespaced object with factory functions per resource. Each
 * factory returns a typed tuple. Use `as const` so TS infers literal types
 * for the namespace strings.
 *
 * Re-exports the older module-local factories (vaultMetadata,
 * proposalSummaries, vaultIncome, addressBook) so call sites can migrate
 * incrementally without breaking imports.
 */

export const queryKeys = {
  vault: {
    /** Per-vault dashboard data (balances, members, settings). */
    data: (multisig: string) => ["vault-data", multisig] as const,
    /** SPL-token holdings for a given vault index. */
    tokens: (multisig: string, vaultIndex: number) =>
      ["vault-tokens", multisig, vaultIndex] as const,
    /** Realised income totals, fed by the audit log + chain queries. */
    income: (multisig: string) => ["vault-income", multisig] as const,
    /** Vault metadata row (name, description, avatar) from Postgres. */
    metadata: (address: string) => ["vault-metadata", address] as const,
  },
  proposals: {
    /** Summary view of open + recent proposals for a multisig. */
    summaries: (multisig: string) => ["proposal-summaries", multisig] as const,
  },
  /** Vaults the connected wallet is a member of. */
  myVaults: () => ["my-vaults"] as const,
  /** Address book scoped to a given owner pubkey. */
  addressBook: (ownerPubkey: string | undefined) => ["address-book", ownerPubkey ?? ""] as const,
  prices: {
    /** Current SOL/USD price (CoinGecko or fallback). */
    sol: () => ["sol-price"] as const,
    /** SOL price chart over N days. */
    solChart: (days: number) => ["sol-chart", days] as const,
  },
  /** RPC liveness keyed by endpoint URL. */
  rpcHealth: (rpcEndpoint: string) => ["rpc-health", rpcEndpoint] as const,
} as const;

// Re-exports for back-compat: the existing factories are still where they
// were declared; this file just aggregates so call sites can adopt
// `queryKeys.*` over time.
export { vaultMetadataQueryKey } from "./use-vault-metadata";
export { proposalSummariesQueryKey } from "./use-proposal-summaries";
export { vaultIncomeQueryKey } from "./hooks/useVaultIncome";
export { addressBookQueryKey } from "./hooks/useAddressBook";

import {
  type Connection,
  PublicKey,
  type SimulatedTransactionResponse,
  type VersionedTransaction,
} from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";

export type BalanceDelta = {
  address: string;
  preBalance: number;
  postBalance: number;
  delta: number;
};

export type SimulationResult = {
  ok: boolean;
  err: string | null;
  logs: string[];
  balanceDeltas: BalanceDelta[];
  computeUnits: number | null;
  unitsConsumedFraction: number;
};

const MAX_COMPUTE_UNITS = 1_400_000;

/**
 * Simulate a Squads vault transaction's execute call against the RPC.
 *
 * The Cloak operator-side deposit (when the proposal is shielded) runs as a
 * separate transaction and is intentionally not part of this simulation —
 * the panel description in SimulatePanel makes that explicit.
 */
export async function simulateProposal({
  connection,
  multisig,
  transactionIndex,
  proposer,
}: {
  connection: Connection;
  multisig: PublicKey;
  transactionIndex: bigint;
  proposer: PublicKey;
}): Promise<SimulationResult> {
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = await multisigSdk.transactions.vaultTransactionExecute({
    connection,
    multisigPda: multisig,
    transactionIndex,
    member: proposer,
    blockhash,
    feePayer: proposer,
  });

  const addresses = collectTouchedAccounts(tx);

  // Pre-balances must come from a separate read; simulateTransaction returns
  // POST account state only. Order matches `addresses` so we can zip later.
  const preInfos = await connection.getMultipleAccountsInfo(
    addresses.map((a) => new PublicKey(a)),
    "confirmed",
  );
  const preBalances = preInfos.map((info) => info?.lamports ?? 0);

  const sim = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses },
  });

  return shapeSimulation(sim.value, addresses, preBalances);
}

function collectTouchedAccounts(tx: VersionedTransaction): string[] {
  const touched = new Set<string>();
  const keys = tx.message.staticAccountKeys;
  for (const ix of tx.message.compiledInstructions ?? []) {
    for (const idx of ix.accountKeyIndexes) {
      const key = keys[idx];
      if (key) touched.add(key.toBase58());
    }
  }
  return [...touched];
}

function shapeSimulation(
  raw: SimulatedTransactionResponse,
  addresses: string[],
  preBalances: number[],
): SimulationResult {
  const logs = raw.logs ?? [];
  const err = raw.err ? JSON.stringify(raw.err) : null;
  const ok = err === null;

  const balanceDeltas: BalanceDelta[] = [];
  if (raw.accounts) {
    raw.accounts.forEach((acc, i) => {
      const address = addresses[i];
      if (!address) return;
      const post = acc?.lamports ?? preBalances[i] ?? 0;
      const pre = preBalances[i] ?? 0;
      balanceDeltas.push({ address, preBalance: pre, postBalance: post, delta: post - pre });
    });
  }

  const computeUnits = raw.unitsConsumed ?? null;
  const unitsConsumedFraction =
    computeUnits != null ? Math.min(1, computeUnits / MAX_COMPUTE_UNITS) : 0;

  return { ok, err, logs, balanceDeltas, computeUnits, unitsConsumedFraction };
}

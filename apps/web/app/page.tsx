"use client";

// biome-ignore lint/style/useNodejsImportProtocol: Client bundle uses the buffer package polyfill.
import { Buffer } from "buffer";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { type Connection, PublicKey } from "@solana/web3.js";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import * as multisig from "@sqds/multisig";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useCallback } from "react";

type CofreOption = {
  address: string;
  threshold: number;
  members: number;
  transactionIndex: string;
};

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Process in micro-batches to keep UI responsive
async function processBatch(
  accounts: { pubkey: PublicKey; account: { data: Buffer } }[],
  startIdx: number,
  batchSize: number,
  owner: PublicKey,
  results: CofreOption[],
): Promise<number> {
  let foundInBatch = 0;
  
  for (let i = startIdx; i < Math.min(startIdx + batchSize, accounts.length); i++) {
    const { pubkey, account } = accounts[i];
    try {
      if (!account.data || account.data.length === 0) continue;

      const [decoded] = multisig.accounts.Multisig.fromAccountInfo(account);
      if (!decoded?.members || !Array.isArray(decoded.members)) continue;

      const isMember = decoded.members.some((member) => member?.key?.equals?.(owner));
      if (!isMember) continue;

      results.push({
        address: pubkey.toBase58(),
        threshold: decoded.threshold ?? 0,
        members: decoded.members.length,
        transactionIndex: decoded.transactionIndex?.toString?.() ?? "0",
      });
      foundInBatch++;

      if (results.length >= 12) break; // Early exit
    } catch {
      // Skip invalid accounts
    }
  }
  
  return foundInBatch;
}

async function listWalletMultisigs(
  connection: Connection, 
  owner: PublicKey,
  onProgress?: (scanned: number, total: number, found: number) => void,
): Promise<CofreOption[]> {
  try {
    // Limit to 200 most recent accounts to avoid browser freeze
    const MAX_ACCOUNTS = 200;
    const BATCH_SIZE = 10; // Process 10 at a time
    const BATCH_DELAY_MS = 0; // Minimal delay, just yield to event loop
    
    const programAccounts = await connection.getProgramAccounts(
      multisig.PROGRAM_ID,
      {
        commitment: "confirmed",
        encoding: "base64",
        dataSlice: { offset: 0, length: 0 }, // Only fetch account info, not data initially
      }
    );
    
    const totalAccounts = Math.min(programAccounts.length, MAX_ACCOUNTS);
    console.log(`[listWalletMultisigs] Scanning ${totalAccounts} of ${programAccounts.length} accounts`);

    // Now fetch full data for these accounts
    const accountsWithData = programAccounts.slice(0, MAX_ACCOUNTS).map(({ pubkey }) => ({
      pubkey,
      account: { data: Buffer.alloc(0) }, // Will fetch separately
    }));
    
    // Fetch account data in parallel batches (max 100 per call)
    const BATCH_SIZE = 100;
    const accountInfos: (import("@solana/web3.js").AccountInfo<Buffer> | null)[] = [];
    
    for (let i = 0; i < accountsWithData.length; i += BATCH_SIZE) {
      const batch = accountsWithData.slice(i, i + BATCH_SIZE);
      const batchInfos = await connection.getMultipleAccountsInfo(
        batch.map(a => a.pubkey),
        "confirmed",
      );
      accountInfos.push(...batchInfos);
    }
    
    const validAccounts = accountInfos
      .map((info, idx) => (info ? { pubkey: accountsWithData[idx].pubkey, account: { data: Buffer.from(info.data) } } : null))
      .filter(Boolean) as { pubkey: PublicKey; account: { data: Buffer } }[];

    const results: CofreOption[] = [];
    let scanned = 0;
    
    // Process in micro-batches to keep UI responsive
    for (let i = 0; i < validAccounts.length; i += BATCH_SIZE) {
      await processBatch(validAccounts, i, BATCH_SIZE, owner, results);
      scanned += Math.min(BATCH_SIZE, validAccounts.length - i);
      
      onProgress?.(scanned, validAccounts.length, results.length);
      
      if (results.length >= 12) break; // Found enough
      
      // Yield to event loop every batch
      if (i + BATCH_SIZE < validAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`[listWalletMultisigs] Found ${results.length} memberships`);
    return results;
  } catch (error) {
    console.error("[listWalletMultisigs] Failed:", error);
    if (error instanceof Error && error.message?.includes("429")) {
      throw new Error("RPC rate limit exceeded. Please wait and try again.");
    }
    throw new Error("Failed to scan memberships. RPC may be unavailable.");
  }
}

export default function HomePage() {
  const router = useRouter();
  const wallet = useWallet();
  const { connection } = useConnection();
  const [manualAddress, setManualAddress] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0, found: 0 });

  const multisigsQuery = useQuery({
    queryKey: ["wallet-multisigs", wallet.publicKey?.toBase58()],
    queryFn: async () => {
      if (!wallet.publicKey) return [];
      setScanProgress({ scanned: 0, total: 0, found: 0 });
      return listWalletMultisigs(connection, wallet.publicKey, (scanned, total, found) => {
        setScanProgress({ scanned, total, found });
      });
    },
    enabled: false,
    staleTime: Infinity,
    retry: 1,
  });

  const canSubmitManual = useMemo(() => manualAddress.trim().length > 0, [manualAddress]);

  const openManualCofre = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError(null);
    try {
      const pubkey = new PublicKey(manualAddress.trim());
      router.push(`/cofre/${pubkey.toBase58()}`);
    } catch {
      setManualError("Enter a valid multisig address.");
    }
  }, [manualAddress, router]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href="/" className="rounded-md text-sm font-semibold tracking-wide text-neutral-100">
            Cloak Squads
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[1.1fr_0.9fr] md:px-6 md:py-10">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-emerald-300">Devnet cofre picker</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-semibold text-neutral-50 md:text-4xl">
              Select a Squads multisig to manage private execution.
            </h1>
          </div>

          <form onSubmit={openManualCofre} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 md:p-5">
            <label htmlFor="manual-multisig" className="text-sm font-medium text-neutral-100">
              Multisig address
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="manual-multisig"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder="SQDS multisig public key"
                className="min-h-10 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
              <button
                type="submit"
                disabled={!canSubmitManual}
                className="min-h-10 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-neutral-700"
              >
                Open cofre
              </button>
            </div>
            {manualError && <p className="mt-2 text-sm text-red-300">{manualError}</p>}
          </form>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 p-4">
            <h2 className="text-base font-semibold text-neutral-50">Your multisigs</h2>
          </div>

          {!wallet.connected ? (
            <div className="p-4 text-sm text-neutral-300">Connect your wallet first.</div>
          ) : multisigsQuery.isFetching ? (
            <div className="space-y-3 p-4">
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                  <div 
                    className="h-full bg-emerald-400 transition-all duration-300"
                    style={{ width: `${scanProgress.total > 0 ? (scanProgress.scanned / scanProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-400">
                  Scanned {scanProgress.scanned} of {scanProgress.total} accounts...
                  {scanProgress.found > 0 && ` (${scanProgress.found} found)`}
                </p>
              </div>
              <div className="h-14 rounded-md bg-neutral-800 animate-pulse" />
              <div className="h-14 rounded-md bg-neutral-800 animate-pulse" />
            </div>
          ) : multisigsQuery.isError ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-red-300">
                {multisigsQuery.error instanceof Error ? multisigsQuery.error.message : "Failed to load"}
              </p>
              <button
                type="button"
                onClick={() => multisigsQuery.refetch()}
                className="min-h-10 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100"
              >
                Retry
              </button>
            </div>
          ) : multisigsQuery.data === undefined ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-neutral-300">Memberships not auto-fetched.</p>
              <button
                type="button"
                onClick={() => multisigsQuery.refetch()}
                className="min-h-10 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100"
              >
                Scan memberships
              </button>
            </div>
          ) : multisigsQuery.data.length > 0 ? (
            <div className="divide-y divide-neutral-800">
              {multisigsQuery.data.map((item) => (
                <Link
                  key={item.address}
                  href={`/cofre/${item.address}`}
                  className="block p-4 transition hover:bg-neutral-800"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm text-neutral-100">{truncateAddress(item.address)}</span>
                    <span className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                      {item.threshold} of {item.members}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-neutral-300">No memberships found.</div>
          )}
        </div>
      </section>
    </main>
  );
}

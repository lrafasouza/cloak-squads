"use client";

import { cofrePda } from "@cloak-squads/core/pda";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import Link from "next/link";
import { type FormEvent, useCallback, use, useEffect, useMemo, useState } from "react";
import { buildExecuteWithLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import { loadProposalDraft } from "@/lib/session-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";

type ProposalDraft = {
  amount: string;
  recipient: string;
  memo: string;
  payloadHash: number[];
  invariants: {
    nullifier: number[];
    commitment: number[];
    amount: string;
    tokenMint: string;
    recipientVkPub: number[];
    nonce: number[];
  };
};

export default function OperatorPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const [txIndex, setTxIndex] = useState("");
  const [pending, setPending] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedDraft, setLoadedDraft] = useState<ProposalDraft | null>(null);
  const [registeredOperator, setRegisteredOperator] = useState<string | null>(null);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const fetchOperator = useCallback(async () => {
    if (!multisigAddress) return;
    try {
      const cofre = cofrePda(multisigAddress)[0];
      const account = await connection.getAccountInfo(cofre);
      if (!account) return;
      const operatorBytes = account.data.subarray(40, 72);
      setRegisteredOperator(new PublicKey(operatorBytes).toBase58());
    } catch {
      // ignore
    }
  }, [connection, multisigAddress]);

  useEffect(() => {
    void fetchOperator();
  }, [fetchOperator]);

  const operatorMismatch = useMemo(() => {
    if (!registeredOperator || !wallet.publicKey) return false;
    return registeredOperator !== wallet.publicKey.toBase58();
  }, [registeredOperator, wallet.publicKey]);

  function loadDraft() {
    if (!txIndex || !multisig) return;
    const draft = loadProposalDraft<ProposalDraft>(multisig, txIndex);
    setLoadedDraft(draft);
    if (!draft) {
      setError(`No draft found in sessionStorage for proposal #${txIndex}. Create it from the Send page first.`);
    } else {
      setError(null);
    }
  }

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSignature(null);
    setPending(true);

    try {
      if (!wallet.publicKey) throw new Error("Connect an operator wallet.");
      if (!multisigAddress) throw new Error("Invalid multisig address.");
      if (!loadedDraft) throw new Error("Load a proposal draft first.");

      const draft = loadedDraft;
      const nullifier = Uint8Array.from(draft.invariants.nullifier);
      const commitment = Uint8Array.from(draft.invariants.commitment);
      const amount = BigInt(draft.invariants.amount);
      const tokenMint = new PublicKey(draft.invariants.tokenMint);
      const recipientVkPub = Uint8Array.from(draft.invariants.recipientVkPub);
      const nonce = Uint8Array.from(draft.invariants.nonce);

      const cloakProgram = new PublicKey(process.env.NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID ?? "");
      if (!cloakProgram.toBase58().length) throw new Error("NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID not set.");

      const [pool] = PublicKey.findProgramAddressSync(
        [Buffer.from("stub_pool"), tokenMint.toBuffer()],
        cloakProgram,
      );
      const [nullifierRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from("nullifier"), nullifier],
        cloakProgram,
      );

      const ix = await buildExecuteWithLicenseIxBrowser({
        multisig: multisigAddress,
        operator: wallet.publicKey,
        invariants: { nullifier, commitment, amount, tokenMint, recipientVkPub, nonce },
        proofBytes: new Uint8Array(256).fill(0),
        merkleRoot: new Uint8Array(32).fill(0),
        cloakProgram,
        pool,
        nullifierRecord,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const sim = await connection.simulateTransaction(tx, undefined, true);
      console.log("[operator] simulate:", sim);
      if (sim.value.err) {
        throw new Error(
          `Simulation failed: ${JSON.stringify(sim.value.err)} | ${(sim.value.logs ?? []).join(" || ")}`,
        );
      }

      const sig = await wallet.sendTransaction(tx, connection);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      setSignature(sig);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not execute with license.");
    } finally {
      setPending(false);
    }
  }

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-emerald-300">Back to picker</Link>
        <h1 className="mt-6 text-2xl font-semibold text-neutral-50">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href={`/cofre/${multisigAddress.toBase58()}`} className="text-sm font-semibold text-neutral-100">
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-emerald-300">F1 operator</p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Execute with license</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            The operator wallet consumes an approved+executed license, calling
            <code className="mx-1 text-emerald-300">execute_with_license</code> on the gatekeeper.
            Load a proposal draft created from the Send page, then execute.
          </p>
        </div>

        <div className="grid gap-4">
          {registeredOperator ? (
            <section className={`rounded-lg border p-4 ${operatorMismatch ? "border-amber-900 bg-amber-950" : "border-emerald-900 bg-emerald-950"}`}>
              <dl className="grid gap-1 text-sm">
                <div>
                  <dt className="text-neutral-400">Registered operator</dt>
                  <dd className="break-all font-mono text-neutral-100">{registeredOperator}</dd>
                </div>
                {operatorMismatch && wallet.publicKey ? (
                  <p className="mt-2 text-amber-200">
                    Connected wallet <span className="font-mono">{wallet.publicKey.toBase58()}</span> does not match the registered operator. Switch wallets.
                  </p>
                ) : null}
              </dl>
            </section>
          ) : null}

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Load proposal draft</h2>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="txIndex">Proposal # (transaction index)</Label>
                <Input
                  id="txIndex"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={txIndex}
                  onChange={(e) => setTxIndex(e.target.value)}
                  placeholder="4"
                  className="mt-1 font-mono"
                />
              </div>
              <Button type="button" variant="secondary" onClick={loadDraft} disabled={!txIndex}>
                Load
              </Button>
            </div>
          </section>

          {loadedDraft ? (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-3 text-base font-semibold text-neutral-50">Draft invariants</h2>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-neutral-400">Amount</dt>
                  <dd className="font-mono text-neutral-100">{loadedDraft.amount} lamports</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Recipient</dt>
                  <dd className="break-all font-mono text-neutral-100">{loadedDraft.recipient}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Nullifier</dt>
                  <dd className="break-all font-mono text-xs text-neutral-300">
                    {Uint8Array.from(loadedDraft.invariants.nullifier).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Payload hash</dt>
                  <dd className="break-all font-mono text-xs text-neutral-300">
                    {Uint8Array.from(loadedDraft.payloadHash).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          <form onSubmit={execute} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Execute</h2>
            <p className="mb-4 text-xs text-neutral-400">
              Uses mock proof (256 zero bytes) and mock merkle root (32 zero bytes).
              Connect the operator wallet (different from the Squads member).
            </p>
            <Button type="submit" disabled={pending || !loadedDraft || !wallet.publicKey || operatorMismatch}>
              {pending ? "Executing..." : "Execute with license"}
            </Button>
            {!wallet.publicKey ? (
              <p className="mt-2 text-xs text-amber-300">Connect an operator wallet first.</p>
            ) : null}
            {operatorMismatch && wallet.publicKey ? (
              <p className="mt-2 text-xs text-amber-300">Wrong wallet. Switch to the registered operator.</p>
            ) : null}
            {!loadedDraft ? (
              <p className="mt-2 text-xs text-amber-300">Load a proposal draft above.</p>
            ) : null}
          </form>

          {error ? (
            <section className="rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
              {error}
            </section>
          ) : null}

          {signature ? (
            <section className="rounded-md border border-emerald-900 bg-emerald-950 p-3">
              <p className="text-sm font-medium text-emerald-200">License consumed</p>
              <p className="mt-2 break-all font-mono text-xs text-emerald-100">{signature}</p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

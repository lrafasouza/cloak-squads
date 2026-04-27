"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { publicEnv } from "@/lib/env";
import { buildExecuteWithLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import { cofrePda } from "@cloak-squads/core/pda";
import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  transact,
} from "@cloak.dev/sdk-devnet";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ComputeBudgetProgram, PublicKey, Transaction } from "@solana/web3.js";
import Link from "next/link";
import { type FormEvent, use, useCallback, useEffect, useMemo, useState } from "react";

type SingleDraft = {
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

type PayrollRecipient = {
  id: string;
  name: string;
  wallet: string;
  amount: string;
  memo?: string;
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

type PayrollDraft = {
  totalAmount: string;
  recipientCount: number;
  recipients: PayrollRecipient[];
};

type ExecutionStep = {
  index: number;
  status: "pending" | "running" | "success" | "error";
  signature?: string | undefined;
  error?: string | undefined;
};

async function cloakDepositBrowser(
  connection: Parameters<typeof transact>[1]["connection"],
  wallet: {
    publicKey: PublicKey | null;
    signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  },
  amount: bigint,
  mint: PublicKey = NATIVE_SOL_MINT,
): Promise<{
  signature: string;
  leafIndex: number;
  spendKeyHex: string;
  blindingHex: string;
}> {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }
  const outputKeypair = await generateUtxoKeypair();
  const outputUtxo = await createUtxo(amount, outputKeypair, mint);

  const zeroIn0 = await createZeroUtxo(mint);
  const zeroIn1 = await createZeroUtxo(mint);
  const zeroOut = await createZeroUtxo(mint);

  const result = await transact(
    {
      inputUtxos: [zeroIn0, zeroIn1],
      outputUtxos: [outputUtxo, zeroOut],
      externalAmount: amount,
      depositor: wallet.publicKey,
    },
    {
      connection,
      programId: CLOAK_PROGRAM_ID,
      relayUrl: "https://api.devnet.cloak.ag",
      signTransaction: wallet.signTransaction,
      depositorPublicKey: wallet.publicKey,
      onProgress: (s: string) => console.error(`[cloak] ${s}`),
      onProofProgress: (p: number) => console.error(`[cloak] proof ${p}%`),
    } as Parameters<typeof transact>[1],
  );

  return {
    signature: result.signature,
    leafIndex: result.commitmentIndices[0],
    spendKeyHex: outputKeypair.privateKey.toString(16).padStart(64, "0"),
    blindingHex: outputUtxo.blinding.toString(16).padStart(64, "0"),
  };
}

export default function OperatorPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();
  const gatekeeperProgram = useMemo(
    () => new PublicKey(publicEnv.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID),
    [],
  );
  const [txIndex, setTxIndex] = useState("");
  const [pending, setPending] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [cloakSignature, setCloakSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedDraft, setLoadedDraft] = useState<SingleDraft | null>(null);
  const [payrollDraft, setPayrollDraft] = useState<PayrollDraft | null>(null);
  const [registeredOperator, setRegisteredOperator] = useState<string | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [executing, setExecuting] = useState(false);

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
      const cofre = cofrePda(multisigAddress, gatekeeperProgram)[0];
      const accountInfo = await connection.getAccountInfo(cofre);
      if (!accountInfo) return;
      const coder = new BorshAccountsCoder(IDL as Idl);
      const decoded = coder.decode<any>("cofre", accountInfo.data);
      if (decoded?.operator) {
        setRegisteredOperator(new PublicKey(decoded.operator).toBase58());
      }
    } catch {
      // ignore
    }
  }, [connection, gatekeeperProgram, multisigAddress]);

  useEffect(() => {
    void fetchOperator();
  }, [fetchOperator]);

  const operatorMismatch = useMemo(() => {
    if (!registeredOperator || !wallet.publicKey) return false;
    return registeredOperator !== wallet.publicKey.toBase58();
  }, [registeredOperator, wallet.publicKey]);

  async function loadDraft() {
    if (!txIndex || !multisig) return;
    setLoadedDraft(null);
    setPayrollDraft(null);
    setError(null);
    setSignature(null);
    setExecutionSteps([]);

    try {
      // Try single draft first
      const singleResponse = await fetch(
        `/api/proposals/${encodeURIComponent(multisig)}/${encodeURIComponent(txIndex)}`,
      );
      if (singleResponse.ok) {
        const draft = (await singleResponse.json()) as SingleDraft;
        setLoadedDraft(draft);
        return;
      }

      // Try payroll draft
      const payrollResponse = await fetch(
        `/api/payrolls/${encodeURIComponent(multisig)}/${encodeURIComponent(txIndex)}`,
      );
      if (payrollResponse.ok) {
        const draft = (await payrollResponse.json()) as PayrollDraft;
        setPayrollDraft(draft);
        setExecutionSteps(draft.recipients.map((_, i) => ({ index: i, status: "pending" })));
        return;
      }

      setError(
        `No persisted draft found for proposal #${txIndex}. Create it from the Send or Payroll page first.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load proposal draft.");
    }
  }

  async function executeSingle(draft: SingleDraft, doCloakDeposit = true) {
    if (!wallet.publicKey || !multisigAddress) return;

    const nullifier = Uint8Array.from(draft.invariants.nullifier);
    const commitment = Uint8Array.from(draft.invariants.commitment);
    const amount = BigInt(draft.invariants.amount);
    const tokenMint = new PublicKey(draft.invariants.tokenMint);
    const recipientVkPub = Uint8Array.from(draft.invariants.recipientVkPub);
    const nonce = Uint8Array.from(draft.invariants.nonce);

    // Step 1: Cloak deposit (real)
    let cloakSig: string | undefined;
    let cloakLeafIndex: number | undefined;
    if (doCloakDeposit) {
      try {
        const cloakResult = await cloakDepositBrowser(connection, wallet, amount, tokenMint);
        cloakSig = cloakResult.signature;
        cloakLeafIndex = cloakResult.leafIndex;
        setCloakSignature(cloakSig);

        // Store UTXO data for future claim (linked by invoice if available)
        if (loadedDraft?.recipient) {
          try {
            // Find stealth invoice by recipient wallet
            const invoicesRes = await fetch(
              `/api/stealth/${encodeURIComponent(multisigAddress.toBase58())}`,
            );
            if (invoicesRes.ok) {
              const invoices = (await invoicesRes.json()) as Array<{
                id: string;
                recipientWallet: string;
                status: string;
              }>;
              const invoice = invoices.find(
                (inv) =>
                  inv.recipientWallet === loadedDraft.recipient && inv.status === "pending",
              );
              if (invoice) {
                await fetch(`/api/stealth/${invoice.id}/utxo`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    utxoAmount: amount.toString(),
                    utxoPrivateKey: cloakResult.spendKeyHex,
                    utxoPublicKey: cloakResult.spendKeyHex, // Will be derived
                    utxoBlinding: cloakResult.blindingHex,
                    utxoMint: tokenMint.toBase58(),
                    utxoLeafIndex: cloakResult.leafIndex,
                    utxoCommitment: draft.invariants.commitment
                      ? Array.from(draft.invariants.commitment)
                          .map((b) => b.toString(16).padStart(2, "0"))
                          .join("")
                      : undefined,
                  }),
                });
              }
            }
          } catch {
            // Non-fatal: UTXO storage failure shouldn't block execution
            console.warn("Failed to store UTXO data for claim");
          }
        }
      } catch (caught) {
        throw new Error(
          `Cloak deposit failed: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }
    }

    const cloakProgram = new PublicKey(publicEnv.NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID);

    const [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("stub_pool"), tokenMint.toBuffer()],
      cloakProgram,
    );
    const [nullifierRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from("nullifier"), nullifier],
      cloakProgram,
    );

    // TODO: Replace mock proofs with real ZK proofs before mainnet.
    // This is safe for devnet/testing only. Real implementation needs:
    // 1. Generate proof from Cloak SDK (proveOwnership + proveTransfer)
    // 2. Build merkle root from on-chain shielded pool state
    // 3. Use actual circuit artifacts (Groth16)
    const ix = await buildExecuteWithLicenseIxBrowser({
      multisig: multisigAddress,
      operator: wallet.publicKey,
      invariants: { nullifier, commitment, amount, tokenMint, recipientVkPub, nonce },
      proofBytes: new Uint8Array(256).fill(0), // MOCK — replace with real proof
      merkleRoot: new Uint8Array(32).fill(0), // MOCK — replace with real merkle root
      cloakProgram,
      pool,
      nullifierRecord,
    });

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
      ix,
    );
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const sim = await connection.simulateTransaction(tx, undefined, true);
    if (sim.value.err) {
      throw new Error(
        `Simulation failed: ${JSON.stringify(sim.value.err)} | ${(sim.value.logs ?? []).join(" || ")}`,
      );
    }

    const sig = await wallet.sendTransaction(tx, connection);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    return sig;
  }

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSignature(null);
    setPending(true);

    try {
      if (!wallet.publicKey) throw new Error("Connect an operator wallet.");
      if (!multisigAddress) throw new Error("Invalid multisig address.");

      if (loadedDraft) {
        const sig = await executeSingle(loadedDraft, true);
        setSignature(sig ?? null);
      } else if (payrollDraft) {
        // Chained execution
        await executePayroll();
      } else {
        throw new Error("Load a proposal draft first.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not execute with license.");
    } finally {
      setPending(false);
      setExecuting(false);
    }
  }

  async function executePayroll() {
    if (!payrollDraft || !wallet.publicKey || !multisigAddress) return;

    setExecuting(true);
    const steps = payrollDraft.recipients.map((_, i) => ({ index: i, status: "pending" as const }));
    setExecutionSteps(steps);

    for (let i = 0; i < payrollDraft.recipients.length; i++) {
      // Update current step to running
      setExecutionSteps((prev) =>
        prev.map((s) => (s.index === i ? { ...s, status: "running" } : s)),
      );

      try {
        const recipient = payrollDraft.recipients[i]!;
        const sig = await executeSingle(
          {
            amount: recipient.amount,
            recipient: recipient.wallet,
            memo: recipient.memo ?? "",
            payloadHash: recipient.payloadHash,
            invariants: recipient.invariants,
          },
          false,
        );

        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "success", signature: sig } : s)),
        );
      } catch (caught) {
        const errorMsg = caught instanceof Error ? caught.message : "Execution failed";
        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "error", error: errorMsg } : s)),
        );
        setError(
          `Execution failed at step ${i + 1}/${payrollDraft.recipients.length}: ${errorMsg}`,
        );
        break;
      }
    }
  }

  function retryFromStep(stepIndex: number) {
    if (!payrollDraft) return;

    // Reset steps from stepIndex onwards
    setExecutionSteps((prev) =>
      prev.map((s) =>
        s.index >= stepIndex
          ? { ...s, status: "pending", signature: undefined, error: undefined }
          : s,
      ),
    );
    setError(null);

    // Re-run from stepIndex
    setExecuting(true);
    void runFromStep(stepIndex);
  }

  async function runFromStep(startIndex: number) {
    if (!payrollDraft || !wallet.publicKey || !multisigAddress) return;

    for (let i = startIndex; i < payrollDraft.recipients.length; i++) {
      setExecutionSteps((prev) =>
        prev.map((s) => (s.index === i ? { ...s, status: "running" } : s)),
      );

      try {
        const recipient = payrollDraft.recipients[i]!;
        const sig = await executeSingle(
          {
            amount: recipient.amount,
            recipient: recipient.wallet,
            memo: recipient.memo ?? "",
            payloadHash: recipient.payloadHash,
            invariants: recipient.invariants,
          },
          false,
        );

        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "success", signature: sig } : s)),
        );
      } catch (caught) {
        const errorMsg = caught instanceof Error ? caught.message : "Execution failed";
        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "error", error: errorMsg } : s)),
        );
        setError(
          `Execution failed at step ${i + 1}/${payrollDraft.recipients.length}: ${errorMsg}`,
        );
        break;
      }
    }

    setExecuting(false);
  }

  const successCount = executionSteps.filter((s) => s.status === "success").length;
  const isPayroll = payrollDraft !== null;

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-emerald-300">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-neutral-50">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href={`/cofre/${multisigAddress.toBase58()}`}
            className="text-sm font-semibold text-neutral-100"
          >
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-emerald-300">Operator</p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Execute with license</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            The operator wallet consumes an approved+executed license, calling
            <code className="mx-1 text-emerald-300">execute_with_license</code> on the gatekeeper.
            Load a proposal draft created from the Send or Payroll page, then execute.
          </p>
        </div>

        <div className="grid gap-4">
          {registeredOperator ? (
            <section
              className={`rounded-lg border p-4 ${operatorMismatch ? "border-amber-900 bg-amber-950" : "border-emerald-900 bg-emerald-950"}`}
            >
              <dl className="grid gap-1 text-sm">
                <div>
                  <dt className="text-neutral-400">Registered operator</dt>
                  <dd className="break-all font-mono text-neutral-100">{registeredOperator}</dd>
                </div>
                {operatorMismatch && wallet.publicKey ? (
                  <p className="mt-2 text-amber-200">
                    Connected wallet{" "}
                    <span className="font-mono">{wallet.publicKey.toBase58()}</span> does not match
                    the registered operator. Switch wallets.
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadDraft()}
                disabled={!txIndex}
              >
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
                    {Uint8Array.from(loadedDraft.invariants.nullifier).reduce(
                      (s, b) => s + b.toString(16).padStart(2, "0"),
                      "",
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Payload hash</dt>
                  <dd className="break-all font-mono text-xs text-neutral-300">
                    {Uint8Array.from(loadedDraft.payloadHash).reduce(
                      (s, b) => s + b.toString(16).padStart(2, "0"),
                      "",
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          {isPayroll && payrollDraft ? (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-3 text-base font-semibold text-neutral-50">
                Payroll batch — {payrollDraft.recipientCount} recipients
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-left">
                      <th className="pb-2 pr-4 text-neutral-400">#</th>
                      <th className="pb-2 pr-4 text-neutral-400">Name</th>
                      <th className="pb-2 pr-4 text-neutral-400 text-right">Amount</th>
                      <th className="pb-2 text-neutral-400">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {payrollDraft.recipients.map((r, i) => {
                      const step = executionSteps[i];
                      return (
                        <tr key={r.id}>
                          <td className="py-2 pr-4 text-neutral-400">{i + 1}</td>
                          <td className="py-2 pr-4 text-neutral-100">{r.name}</td>
                          <td className="py-2 pr-4 text-right font-mono text-neutral-100">
                            {Number(r.amount).toLocaleString()}
                          </td>
                          <td className="py-2">
                            {!step || step.status === "pending" ? (
                              <span className="text-neutral-400">Pending</span>
                            ) : step.status === "running" ? (
                              <span className="text-amber-300">Running…</span>
                            ) : step.status === "success" ? (
                              <span className="text-emerald-300">Done</span>
                            ) : (
                              <div>
                                <span className="text-red-300">Failed</span>
                                <button
                                  type="button"
                                  onClick={() => retryFromStep(i)}
                                  disabled={executing}
                                  className="ml-2 text-xs text-emerald-300 hover:text-emerald-200 disabled:text-neutral-500"
                                >
                                  Retry
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {executionSteps.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Progress</span>
                    <span>
                      {successCount}/{payrollDraft.recipientCount}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{
                        width: `${(successCount / payrollDraft.recipientCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <form
            onSubmit={execute}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
          >
            <h2 className="mb-4 text-base font-semibold text-neutral-50">Execute</h2>
            <p className="mb-4 text-xs text-neutral-400">
              Uses mock proof (256 zero bytes) and mock merkle root (32 zero bytes). Connect the
              operator wallet (different from the Squads member).
            </p>
            <Button
              type="submit"
              disabled={
                pending || (!loadedDraft && !payrollDraft) || !wallet.publicKey || operatorMismatch
              }
            >
              {pending
                ? isPayroll
                  ? "Executing batch…"
                  : "Executing…"
                : isPayroll
                  ? "Execute batch"
                  : "Execute with license"}
            </Button>
            {!wallet.publicKey ? (
              <p className="mt-2 text-xs text-amber-300">Connect an operator wallet first.</p>
            ) : null}
            {operatorMismatch && wallet.publicKey ? (
              <p className="mt-2 text-xs text-amber-300">
                Wrong wallet. Switch to the registered operator.
              </p>
            ) : null}
            {!loadedDraft && !payrollDraft ? (
              <p className="mt-2 text-xs text-amber-300">Load a proposal draft above.</p>
            ) : null}
          </form>

          {error ? (
            <section className="rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
              {error}
            </section>
          ) : null}

          {cloakSignature ? (
            <section className="rounded-md border border-indigo-900 bg-indigo-950 p-3">
              <p className="text-sm font-medium text-indigo-200">Cloak deposit confirmed</p>
              <p className="mt-2 break-all font-mono text-xs text-indigo-100">{cloakSignature}</p>
            </section>
          ) : null}

          {signature && !isPayroll ? (
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

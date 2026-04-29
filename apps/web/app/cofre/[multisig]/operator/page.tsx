"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";

import { publicEnv } from "@/lib/env";
import { buildExecuteWithLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import {
  type OperatorExecutionBlockReason,
  type OperatorLicenseStatus,
  type ProposalStatus,
  getOperatorExecutionState,
  normalizeLicenseStatus,
} from "@/lib/operator-license-state";
import { lamportsToSol } from "@/lib/sol";
import { cloakDirectTransactOptions } from "@cloak-squads/core/cloak-direct-mode";
import { computePayloadHash } from "@cloak-squads/core/hashing";
import { cofrePda, licensePda } from "@cloak-squads/core/pda";
import {
  CLOAK_PROGRAM_ID,
  type MerkleTree,
  NATIVE_SOL_MINT,
  type Utxo,
  computeUtxoCommitment,
  createUtxo,
  createZeroUtxo,
  derivePublicKey,
  fullWithdraw,
  generateUtxoKeypair,
  transact,
} from "@cloak.dev/sdk-devnet";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import * as squadsMultisig from "@sqds/multisig";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type DraftSummary = {
  id: string;
  transactionIndex: string;
  amount: string;
  recipient: string;
  memo: string;
  createdAt: string;
  type: "single" | "payroll";
  recipientCount?: number;
  totalAmount?: string;
};

type CommitmentClaim = {
  amount: string;
  invoiceId?: string;
  keypairPrivateKey: string;
  keypairPublicKey: string;
  blinding: string;
  commitment: string;
  recipient_vk: string;
  token_mint: string;
};

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
  commitmentClaim?: CommitmentClaim;
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
  commitmentClaim?: CommitmentClaim;
  invoiceId?: string;
};

type PayrollDraft = {
  totalAmount: string;
  recipientCount: number;
  mode: string;
  recipients: PayrollRecipient[];
};

type ExecutionStep = {
  index: number;
  status: "pending" | "running" | "success" | "error";
  signature?: string | undefined;
  error?: string | undefined;
};

type CloakDepositCache = {
  signature: string;
  leafIndex: number;
  spendKeyHex: string;
  blindingHex: string;
  outputUtxos?: Utxo[] | undefined;
  merkleTree?: MerkleTree | undefined;
};

type DraftInvariants = SingleDraft["invariants"];

type DecodedLicense = {
  status?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
};

function cloakDepositCacheKey(multisig: string, transactionIndex: string) {
  return `cloak-deposit:${multisig}:${transactionIndex}`;
}

function readCloakDepositCache(
  multisig: string,
  transactionIndex: string,
): CloakDepositCache | null {
  try {
    const raw = sessionStorage.getItem(cloakDepositCacheKey(multisig, transactionIndex));
    return raw ? (JSON.parse(raw) as CloakDepositCache) : null;
  } catch {
    return null;
  }
}

function writeCloakDepositCache(
  multisig: string,
  transactionIndex: string,
  value: CloakDepositCache,
) {
  try {
    sessionStorage.setItem(cloakDepositCacheKey(multisig, transactionIndex), JSON.stringify(value));
  } catch {
    // Best effort cache only; execution can continue without it.
  }
}

async function cloakDepositBrowser(
  connection: Parameters<typeof transact>[1]["connection"],
  wallet: {
    publicKey: PublicKey | null;
    signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
    signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  },
  amount: bigint,
  mint: PublicKey = NATIVE_SOL_MINT,
  existingOutputUtxo?: Awaited<ReturnType<typeof createUtxo>> & {
    keypair: { privateKey: bigint; publicKey: bigint };
  },
): Promise<CloakDepositCache> {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  let outputUtxo: Awaited<ReturnType<typeof createUtxo>>;
  let outputKeypair: { privateKey: bigint; publicKey: bigint };

  if (existingOutputUtxo) {
    outputUtxo = existingOutputUtxo;
    outputKeypair = existingOutputUtxo.keypair;
  } else {
    outputKeypair = await generateUtxoKeypair();
    outputUtxo = await createUtxo(amount, outputKeypair, mint);
  }

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
      // Keep operator deposits independent from relay /health availability.
      // The relay may return 503 and trigger duplicate-submit edge cases in the SDK fallback path.
      ...cloakDirectTransactOptions,
      signTransaction: wallet.signTransaction,
      signMessage: wallet.signMessage,
      depositorPublicKey: wallet.publicKey,
      onProgress: (s: string) => console.error(`[cloak] ${s}`),
      onProofProgress: (p: number) => console.error(`[cloak] proof ${p}%`),
    } as Parameters<typeof transact>[1],
  );

  const leafIndex = result.commitmentIndices[0];
  if (leafIndex === undefined) {
    throw new Error("Deposit returned no commitment indices.");
  }

  return {
    signature: result.signature,
    leafIndex,
    spendKeyHex: outputKeypair.privateKey.toString(16).padStart(64, "0"),
    blindingHex: outputUtxo.blinding.toString(16).padStart(64, "0"),
    outputUtxos: result.outputUtxos,
    merkleTree: result.merkleTree,
  };
}

function draftInvariantsToPayload(input: DraftInvariants) {
  return {
    nullifier: Uint8Array.from(input.nullifier),
    commitment: Uint8Array.from(input.commitment),
    amount: BigInt(input.amount),
    tokenMint: new PublicKey(input.tokenMint),
    recipientVkPub: Uint8Array.from(input.recipientVkPub),
    nonce: Uint8Array.from(input.nonce),
  };
}

function numberFromAnchorValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object") {
    const maybeNumber = value as { toNumber?: () => number; toString?: () => string };
    if (typeof maybeNumber.toNumber === "function") return maybeNumber.toNumber();
    if (typeof maybeNumber.toString === "function") {
      const parsed = Number(maybeNumber.toString());
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

function bytesToHex(bytes: Uint8Array | number[]) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function operatorStatusMessage(reason: OperatorExecutionBlockReason) {
  if (reason === "ready") return null;
  if (reason === "license-loading") return "Checking license status on-chain...";
  if (reason === "execute-vault-transaction") {
    return "Execute the Squads vault transaction first to issue the license, then run operator execution.";
  }
  if (reason === "proposal-not-approved") {
    return "This proposal is not ready yet. Wait for approvals, then execute the Squads vault transaction.";
  }
  if (reason === "license-consumed") return "This license has already been consumed.";
  if (reason === "license-expired") return "This license has expired. Create a new proposal.";
  if (reason === "license-error") return "Could not verify the license account on-chain.";
  return null;
}

function OperatorPageInner({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const searchParams = useSearchParams();
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
  const [withdrawSignature, setWithdrawSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedDraft, setLoadedDraft] = useState<SingleDraft | null>(null);
  const [payrollDraft, setPayrollDraft] = useState<PayrollDraft | null>(null);
  const [registeredOperator, setRegisteredOperator] = useState<string | null>(null);
  const [cofreMissing, setCofreMissing] = useState(false);
  const [operatorBalanceLamports, setOperatorBalanceLamports] = useState<number | null>(null);
  const [operatorBalanceLoading, setOperatorBalanceLoading] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [executing, setExecuting] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState<DraftSummary[]>([]);
  const [draftOnChainStatus, setDraftOnChainStatus] = useState<ProposalStatus>("loading");
  const [licenseStatus, setLicenseStatus] = useState<OperatorLicenseStatus>("idle");
  const autoLoadFiredRef = useRef(false);

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
      if (!accountInfo) {
        setRegisteredOperator(null);
        setCofreMissing(true);
        return;
      }
      setCofreMissing(false);
      const coder = new BorshAccountsCoder(IDL as Idl);
      const decoded = coder.decode<{ operator?: Uint8Array }>("Cofre", accountInfo.data);
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

  useEffect(() => {
    const address = registeredOperator ?? wallet.publicKey?.toBase58();
    if (!address) {
      setOperatorBalanceLamports(null);
      return;
    }
    let cancelled = false;
    setOperatorBalanceLoading(true);
    void (async () => {
      try {
        const balance = await connection.getBalance(new PublicKey(address), "confirmed");
        if (!cancelled) setOperatorBalanceLamports(balance);
      } catch {
        if (!cancelled) setOperatorBalanceLamports(null);
      } finally {
        if (!cancelled) setOperatorBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, registeredOperator, wallet.publicKey]);

  // Auto-load from ?proposal= query param
  useEffect(() => {
    if (autoLoadFiredRef.current) return;
    const proposalParam = searchParams.get("proposal");
    if (!proposalParam) return;
    autoLoadFiredRef.current = true;
    setTxIndex(proposalParam);
  }, [searchParams]);

  // Trigger loadDraft once txIndex is set from query param
  useEffect(() => {
    if (!autoLoadFiredRef.current) return;
    const proposalParam = searchParams.get("proposal");
    if (!proposalParam || txIndex !== proposalParam) return;
    void loadDraft();
  }, [txIndex, searchParams]);

  // Fetch pending proposal drafts for the list
  const fetchPendingDrafts = useCallback(async () => {
    if (!multisig) return;
    try {
      const [singleRes, payrollRes] = await Promise.all([
        fetch(`/api/proposals/${encodeURIComponent(multisig)}`),
        fetch(`/api/payrolls/${encodeURIComponent(multisig)}`),
      ]);
      const singleDrafts: DraftSummary[] = singleRes.ok
        ? ((await singleRes.json()) as DraftSummary[]).map((d) => ({
            ...d,
            type: "single" as const,
          }))
        : [];
      const payrollDrafts: DraftSummary[] = payrollRes.ok
        ? ((await payrollRes.json()) as DraftSummary[]).map((d) => ({
            ...d,
            type: "payroll" as const,
            recipientCount: d.recipientCount ?? 0,
            totalAmount: d.totalAmount ?? "0",
            amount: d.totalAmount ?? "0",
            recipient: `${d.recipientCount ?? 0} recipients`,
          }))
        : [];
      const all = [...singleDrafts, ...payrollDrafts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setPendingDrafts(all);
    } catch {
      // ignore
    }
  }, [multisig]);

  useEffect(() => {
    void fetchPendingDrafts();
  }, [fetchPendingDrafts]);

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
    setWithdrawSignature(null);
    setExecutionSteps([]);
    setLicenseStatus("idle");

    try {
      // Try single draft first
      const singleResponse = await fetch(
        `/api/proposals/${encodeURIComponent(multisig)}/${encodeURIComponent(txIndex)}`,
      );
      if (singleResponse.ok) {
        const draft = (await singleResponse.json()) as SingleDraft;
        setLoadedDraft(draft);
        void checkOnChainStatus(txIndex, draft);
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
        void checkOnChainStatus(txIndex, draft);
        return;
      }

      setError(
        `No persisted draft found for proposal #${txIndex}. Create it from the Send or Payroll page first.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load proposal draft.");
    }
  }

  async function checkOnChainStatus(txIndex: string, draftForLicense?: SingleDraft | PayrollDraft) {
    if (!multisigAddress) return;
    setDraftOnChainStatus("loading");
    setLicenseStatus(draftForLicense ? "loading" : "idle");
    try {
      const [proposalPda] = squadsMultisig.getProposalPda({
        multisigPda: multisigAddress,
        transactionIndex: BigInt(txIndex),
      });
      const proposal = await squadsMultisig.accounts.Proposal.fromAccountAddress(
        connection,
        proposalPda,
      );
      const status = (proposal.status as { __kind?: string })?.__kind?.toLowerCase();
      if (status === "approved") {
        setDraftOnChainStatus("approved");
      } else if (status === "executed") {
        setDraftOnChainStatus("executed");
      } else {
        setDraftOnChainStatus("other");
      }
      if (draftForLicense) {
        await checkLicenseStatus(draftForLicense);
      }
    } catch {
      setDraftOnChainStatus("error");
      if (draftForLicense) setLicenseStatus("error");
    }
  }

  async function checkLicenseStatus(draft: SingleDraft | PayrollDraft) {
    if (!multisigAddress) return;
    const cofre = cofrePda(multisigAddress, gatekeeperProgram)[0];
    const coder = new BorshAccountsCoder(IDL as Idl);
    const now = Math.floor(Date.now() / 1000);
    const invariants =
      "recipients" in draft
        ? draft.recipients.map((recipient) => recipient.invariants)
        : [draft.invariants];

    let sawConsumed = false;
    let sawExpired = false;
    let sawError = false;

    for (const invariant of invariants) {
      const payloadHash = computePayloadHash(draftInvariantsToPayload(invariant));
      const license = licensePda(cofre, payloadHash, gatekeeperProgram)[0];
      const accountInfo = await connection.getAccountInfo(license);
      if (!accountInfo) {
        setLicenseStatus("missing");
        return;
      }

      const decoded = coder.decode<DecodedLicense>("License", accountInfo.data);
      const expiresAt = numberFromAnchorValue(decoded.expiresAt ?? decoded.expires_at);
      const status = normalizeLicenseStatus(decoded.status, expiresAt, now);
      if (status === "consumed") sawConsumed = true;
      if (status === "expired") sawExpired = true;
      if (status === "error") sawError = true;
    }

    if (sawError) setLicenseStatus("error");
    else if (sawExpired) setLicenseStatus("expired");
    else if (sawConsumed) setLicenseStatus("consumed");
    else setLicenseStatus("active");
  }

  async function executeSingle(
    draft: SingleDraft,
    doCloakDeposit = true,
    depositCacheKey = txIndex,
    invoiceId?: string,
  ) {
    if (!wallet.publicKey || !multisigAddress) return;

    const nullifier = Uint8Array.from(draft.invariants.nullifier);
    const commitment = Uint8Array.from(draft.invariants.commitment);
    const amount = BigInt(draft.invariants.amount);
    const tokenMint = new PublicKey(draft.invariants.tokenMint);
    const recipientVkPub = Uint8Array.from(draft.invariants.recipientVkPub);
    const nonce = Uint8Array.from(draft.invariants.nonce);

    // Step 1: Cloak deposit (real)
    let cloakSig: string | undefined;
    if (doCloakDeposit) {
      if (!wallet.signTransaction) {
        throw new Error("Wallet does not support signTransaction");
      }
      try {
        const cachedDeposit = readCloakDepositCache(multisigAddress.toBase58(), depositCacheKey);
        let cloakResult: Awaited<ReturnType<typeof cloakDepositBrowser>>;

        if (cachedDeposit) {
          cloakResult = cachedDeposit;
        } else if (draft.commitmentClaim) {
          // Reconstruct the original UTXO from the draft so the deposit matches the approved payload.
          const privateKey = BigInt(
            `0x${draft.commitmentClaim.keypairPrivateKey.padStart(64, "0")}`,
          );
          const publicKey = await derivePublicKey(privateKey);
          const keypair = { privateKey, publicKey };
          const reconstructedUtxo = await createUtxo(amount, keypair, tokenMint);
          reconstructedUtxo.blinding = BigInt(`0x${draft.commitmentClaim.blinding}`);
          reconstructedUtxo.commitment = await computeUtxoCommitment(reconstructedUtxo);
          const reconstructedCommitmentHex = reconstructedUtxo.commitment
            .toString(16)
            .padStart(64, "0");
          const approvedCommitmentHex = bytesToHex(commitment);
          if (reconstructedCommitmentHex !== approvedCommitmentHex) {
            throw new Error("Approved commitment does not match reconstructed Cloak UTXO.");
          }
          // Attach keypair for the deposit function to use
          (reconstructedUtxo as typeof reconstructedUtxo & { keypair: typeof keypair }).keypair =
            keypair;

          cloakResult = await cloakDepositBrowser(
            connection,
            {
              publicKey: wallet.publicKey,
              signTransaction: wallet.signTransaction,
              ...(wallet.signMessage ? { signMessage: wallet.signMessage } : {}),
            },
            amount,
            tokenMint,
            reconstructedUtxo as Awaited<ReturnType<typeof createUtxo>> & {
              keypair: { privateKey: bigint; publicKey: bigint };
            },
          );
        } else {
          throw new Error("Proposal draft is missing the Cloak UTXO claim. Create a new proposal.");
        }

        cloakSig = cloakResult.signature;
        setCloakSignature(cloakSig);

        // F4 invoice mode: use explicit invoiceId param or fall back to legacy commitmentClaim lookup
        const effectiveInvoiceId = invoiceId ?? draft.commitmentClaim?.invoiceId;

        if (effectiveInvoiceId) {
          // F4: store UTXO data for recipient claim.
          try {
            const storeResponse = await fetch(`/api/stealth/${effectiveInvoiceId}/utxo`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                utxoAmount: amount.toString(),
                utxoPrivateKey: cloakResult.spendKeyHex,
                utxoPublicKey: draft.commitmentClaim?.keypairPublicKey ?? cloakResult.spendKeyHex,
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
            if (!storeResponse.ok) {
              const body = (await storeResponse.json().catch(() => null)) as {
                error?: string;
              } | null;
              throw new Error(body?.error ?? "Could not store UTXO data for claim.");
            }
          } catch {
            if (!cachedDeposit) {
              writeCloakDepositCache(multisigAddress.toBase58(), depositCacheKey, cloakResult);
            }
            throw new Error("Could not store UTXO data for claim.");
          }
          if (!cachedDeposit) {
            writeCloakDepositCache(multisigAddress.toBase58(), depositCacheKey, cloakResult);
          }
        } else if (draft.recipient) {
          // F1: withdraw directly to recipient, no claim needed.
          if (cachedDeposit) {
            // Deposit + withdraw already completed in a prior attempt.
            // Skip fullWithdraw and proceed to execute_with_license below.
          } else {
            if (!cloakResult.outputUtxos || !cloakResult.merkleTree) {
              throw new Error("Cloak deposit did not return withdrawal data.");
            }
            const recipientPubkey = new PublicKey(draft.recipient);
            const withdrawResult = await fullWithdraw(cloakResult.outputUtxos, recipientPubkey, {
              connection,
              programId: CLOAK_PROGRAM_ID,
              ...cloakDirectTransactOptions,
              signTransaction: wallet.signTransaction as Parameters<
                typeof fullWithdraw
              >[2]["signTransaction"],
              ...(wallet.signMessage ? { signMessage: wallet.signMessage } : {}),
              depositorPublicKey: wallet.publicKey,
              cachedMerkleTree: cloakResult.merkleTree,
              onProgress: (s: string) => console.error(`[cloak] withdraw ${s}`),
              onProofProgress: (p: number) => console.error(`[cloak] withdraw proof ${p}%`),
            } as Parameters<typeof fullWithdraw>[2]);
            setWithdrawSignature(withdrawResult.signature);
            // Cache after successful withdraw so retries skip deposit+withdraw and only
            // re-run execute_with_license (prevents double-deposit on operator retry).
            writeCloakDepositCache(multisigAddress.toBase58(), depositCacheKey, cloakResult);
          }
        } else if (!cachedDeposit) {
          writeCloakDepositCache(multisigAddress.toBase58(), depositCacheKey, cloakResult);
        }
      } catch (caught) {
        throw new Error(
          `Cloak deposit failed: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }

    const ix = await buildExecuteWithLicenseIxBrowser({
      multisig: multisigAddress,
      operator: wallet.publicKey,
      invariants: { nullifier, commitment, amount, tokenMint, recipientVkPub, nonce },
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
    setWithdrawSignature(null);
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
        const recipient = payrollDraft.recipients[i];
        if (!recipient) continue;
        const recipientDraft: SingleDraft = {
          amount: recipient.amount,
          recipient: recipient.wallet,
          memo: recipient.memo ?? "",
          payloadHash: recipient.payloadHash,
          invariants: recipient.invariants,
          ...(recipient.commitmentClaim ? { commitmentClaim: recipient.commitmentClaim } : {}),
        };
        const isInvoiceMode = payrollDraft.mode === "invoice";
        if (isInvoiceMode && !recipient.invoiceId) {
          throw new Error(`Recipient ${recipient.name} is missing an invoice.`);
        }
        const sig = await executeSingle(
          recipientDraft,
          true,
          `${txIndex}:${i}`,
          isInvoiceMode ? recipient.invoiceId : undefined,
        );

        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "success", signature: sig } : s)),
        );
      } catch (caught) {
        const errorMsg = caught instanceof Error ? caught.message : "Execution failed";
        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "error", error: errorMsg } : s)),
        );
        break;
      }
    }

    setExecuting(false);
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
        const recipient = payrollDraft.recipients[i];
        if (!recipient) continue;
        const recipientDraft: SingleDraft = {
          amount: recipient.amount,
          recipient: recipient.wallet,
          memo: recipient.memo ?? "",
          payloadHash: recipient.payloadHash,
          invariants: recipient.invariants,
          ...(recipient.commitmentClaim ? { commitmentClaim: recipient.commitmentClaim } : {}),
        };
        const isInvoiceMode = payrollDraft.mode === "invoice";
        if (isInvoiceMode && !recipient.invoiceId) {
          throw new Error(`Recipient ${recipient.name} is missing an invoice.`);
        }
        const sig = await executeSingle(
          recipientDraft,
          true,
          `${txIndex}:${i}`,
          isInvoiceMode ? recipient.invoiceId : undefined,
        );

        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "success", signature: sig } : s)),
        );
      } catch (caught) {
        const errorMsg = caught instanceof Error ? caught.message : "Execution failed";
        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "error", error: errorMsg } : s)),
        );
        break;
      }
    }

    setExecuting(false);
  }

  const successCount = executionSteps.filter((s) => s.status === "success").length;
  const isPayroll = payrollDraft !== null;
  const lowOperatorSol = operatorBalanceLamports !== null && operatorBalanceLamports < 10_000_000;
  const executionState = getOperatorExecutionState({
    hasDraft: !!(loadedDraft || payrollDraft),
    walletConnected: !!wallet.publicKey,
    operatorMismatch,
    cofreMissing,
    lowOperatorSol,
    proposalStatus: draftOnChainStatus,
    licenseStatus,
  });
  const canExecute = !pending && executionState.canExecute;
  const proposalStatusMessage = operatorStatusMessage(executionState.reason);

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-accent">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-bg/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href={`/cofre/${multisigAddress.toBase58()}`}
            className="text-sm font-semibold text-ink"
          >
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-accent">Operator</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Execute with license</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            The operator wallet consumes an approved+executed license, calling
            <code className="mx-1 text-accent">execute_with_license</code> on the gatekeeper.
            Load a proposal draft created from the Send or Payroll page, then execute.
          </p>
        </div>

        <div className="grid gap-4">
          {registeredOperator ? (
            <section
              className={`rounded-lg border p-4 ${operatorMismatch ? "border-amber-900 bg-amber-950" : "border-emerald-900 bg-emerald-950"}`}
            >
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-ink-muted">Registered operator</dt>
                  <dd className="break-all font-mono text-ink">{registeredOperator}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Connected wallet</dt>
                  <dd className="break-all font-mono text-ink">
                    {wallet.publicKey ? wallet.publicKey.toBase58() : "Not connected"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Operator balance</dt>
                  <dd className="font-mono text-ink">
                    {operatorBalanceLoading
                      ? "Loading..."
                      : operatorBalanceLamports === null
                        ? "Unavailable"
                        : `${lamportsToSol(operatorBalanceLamports)} SOL`}
                  </dd>
                </div>
                {operatorMismatch && wallet.publicKey ? (
                  <p className="mt-2 text-amber-200">
                    Connected wallet{" "}
                    <span className="font-mono">{wallet.publicKey.toBase58()}</span> does not match
                    the registered operator. Switch wallets.
                  </p>
                ) : null}
                {lowOperatorSol ? (
                  <p className="rounded-md border border-signal-warn/30 bg-amber-900/40 px-3 py-2 text-amber-100">
                    Operator balance is below 0.01 SOL. Airdrop devnet SOL before executing.
                  </p>
                ) : null}
              </dl>
            </section>
          ) : cofreMissing ? (
            <section className="rounded-lg border border-amber-900 bg-amber-950 p-4 text-sm text-amber-100">
              <p className="font-semibold">Cofre is not initialized yet.</p>
              <p className="mt-1">
                Create, approve, and execute the bootstrap Squads proposal before using the operator
                flow.
              </p>
            </section>
          ) : null}

          {pendingDrafts.length > 0 && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 text-base font-semibold text-ink">
                Proposals ready to execute
              </h2>
              <ul className="grid gap-2">
                {pendingDrafts.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-ink">#{d.transactionIndex}</span>
                      {d.type === "payroll" ? (
                        <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                          payroll
                        </span>
                      ) : (
                        <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-neutral-300">
                          single
                        </span>
                      )}
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {d.type === "payroll"
                          ? `${d.recipientCount ?? 0} recipients · ${lamportsToSol(d.totalAmount ?? d.amount)} SOL`
                          : `${lamportsToSol(d.amount)} SOL`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 text-xs px-3 py-1 h-auto"
                      onClick={() => {
                        setTxIndex(d.transactionIndex);
                        void (async () => {
                          setLoadedDraft(null);
                          setPayrollDraft(null);
                          setError(null);
                          setSignature(null);
                          setExecutionSteps([]);
                          try {
                            const singleResponse = await fetch(
                              `/api/proposals/${encodeURIComponent(multisig)}/${encodeURIComponent(d.transactionIndex)}`,
                            );
                            if (singleResponse.ok) {
                              const draft = (await singleResponse.json()) as SingleDraft;
                              setLoadedDraft(draft);
                              void checkOnChainStatus(d.transactionIndex, draft);
                              return;
                            }
                            const payrollResponse = await fetch(
                              `/api/payrolls/${encodeURIComponent(multisig)}/${encodeURIComponent(d.transactionIndex)}`,
                            );
                            if (payrollResponse.ok) {
                              const draft = (await payrollResponse.json()) as PayrollDraft;
                              setPayrollDraft(draft);
                              setExecutionSteps(
                                draft.recipients.map((_, i) => ({ index: i, status: "pending" })),
                              );
                              void checkOnChainStatus(d.transactionIndex, draft);
                              return;
                            }
                            setError(
                              `No persisted draft found for proposal #${d.transactionIndex}.`,
                            );
                          } catch (caught) {
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : "Could not load proposal draft.",
                            );
                          }
                        })();
                      }}
                    >
                      Load
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-4 text-base font-semibold text-ink">Load proposal draft</h2>
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
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 text-base font-semibold text-ink">Draft invariants</h2>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-ink-muted">Amount</dt>
                  <dd className="font-mono text-ink">
                    {lamportsToSol(loadedDraft.amount)} SOL
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Recipient</dt>
                  <dd className="break-all font-mono text-ink">{loadedDraft.recipient}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Nullifier</dt>
                  <dd className="break-all font-mono text-xs text-neutral-300">
                    {Uint8Array.from(loadedDraft.invariants.nullifier).reduce(
                      (s, b) => s + b.toString(16).padStart(2, "0"),
                      "",
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Payload hash</dt>
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
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 text-base font-semibold text-ink">
                Payroll batch — {payrollDraft.recipientCount} recipients
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 pr-4 text-ink-muted">#</th>
                      <th className="pb-2 pr-4 text-ink-muted">Name</th>
                      <th className="pb-2 pr-4 text-ink-muted text-right">Amount</th>
                      <th className="pb-2 text-ink-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {payrollDraft.recipients.map((r, i) => {
                      const step = executionSteps[i];
                      return (
                        <tr key={r.id}>
                          <td className="py-2 pr-4 text-ink-muted">{i + 1}</td>
                          <td className="py-2 pr-4 text-ink">{r.name}</td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums text-ink">
                            {lamportsToSol(r.amount)} SOL
                          </td>
                          <td className="py-2">
                            {!step || step.status === "pending" ? (
                              <span className="text-ink-muted">Pending</span>
                            ) : step.status === "running" ? (
                              <span className="text-amber-300">Running…</span>
                            ) : step.status === "success" ? (
                              <span className="text-accent">Done</span>
                            ) : (
                              <div>
                                <span className="text-signal-danger">Failed</span>
                                <button
                                  type="button"
                                  onClick={() => retryFromStep(i)}
                                  disabled={executing}
                                  className="ml-2 text-xs text-accent hover:text-accent disabled:text-ink-subtle"
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
                  <div className="flex items-center justify-between text-xs text-ink-muted">
                    <span>Progress</span>
                    <span>
                      {successCount}/{payrollDraft.recipientCount}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
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

          {(loadedDraft || payrollDraft) && proposalStatusMessage ? (
            <section className="rounded-lg border border-amber-900 bg-amber-950 p-4 text-sm text-amber-100">
              {proposalStatusMessage}
            </section>
          ) : null}

          <form
            onSubmit={execute}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <h2 className="mb-4 text-base font-semibold text-ink">Execute</h2>
            <p className="mb-4 text-xs text-ink-muted">
              Connect the registered operator wallet for this cofre.
              {registeredOperator ? (
                <span className="mt-1 block break-all font-mono text-neutral-300">
                  {registeredOperator}
                </span>
              ) : null}
            </p>
            <Button type="submit" disabled={!canExecute}>
              {pending
                ? isPayroll
                  ? "Executing batch…"
                  : "Executing…"
                : isPayroll
                  ? "Execute batch"
                  : "Execute with license"}
            </Button>
            {!wallet.publicKey ? (
              <p className="mt-2 text-xs text-amber-300">
                Connect the registered operator wallet first.
              </p>
            ) : null}
            {operatorMismatch && wallet.publicKey ? (
              <p className="mt-2 text-xs text-amber-300">
                Wrong wallet. Switch to the registered operator.
              </p>
            ) : null}
            {lowOperatorSol ? (
              <p className="mt-2 text-xs text-amber-300">
                Operator needs at least 0.01 SOL on devnet before execution.
              </p>
            ) : null}
            {cofreMissing ? (
              <p className="mt-2 text-xs text-amber-300">
                Cofre bootstrap proposal must be executed before operator execution.
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
              <p className="text-sm font-medium text-accent">License consumed</p>
              <p className="mt-2 break-all font-mono text-xs text-accent">{signature}</p>
            </section>
          ) : null}

          {withdrawSignature ? (
            <section className="rounded-md border border-teal-900 bg-teal-950 p-3">
              <p className="text-sm font-medium text-teal-200">Transfer delivered</p>
              <p className="mt-2 break-all font-mono text-xs text-teal-100">{withdrawSignature}</p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function OperatorPage({ params }: { params: Promise<{ multisig: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <OperatorPageInner params={params} />
    </Suspense>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import {
  DetailRow,
  InlineAlert,
  ProgressBar,
  StatusPill,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/ui/workspace";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ensureCircuitsProxy } from "@/lib/cloak-circuits-proxy";
import { publicEnv } from "@/lib/env";
import { buildExecuteWithLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import IDL from "@/lib/idl/cloak_gatekeeper.json";
import {
  type ExecutionHistoryItem,
  markProposalExecuted,
  readExecutionHistory,
  writeExecutionHistory,
} from "@/lib/operator-execution-history";
import {
  type OperatorExecutionBlockReason,
  type OperatorLicenseStatus,
  type ProposalStatus,
  getOperatorExecutionState,
  normalizeLicenseStatus,
} from "@/lib/operator-license-state";
import { lamportsToSol } from "@/lib/sol";
import { simulateAndOptimize } from "@/lib/tx-optimization";
import { proposalSummariesQueryKey, useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useWalletAuth } from "@/lib/use-wallet-auth";
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
import { PublicKey, Transaction, type VersionedTransaction } from "@solana/web3.js";
import * as squadsMultisig from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { translateCloakProgress } from "@/lib/cloak-progress";
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

type CloakProgressCallbacks = {
  onProgress?: (message: string) => void;
  onProofProgress?: (progress: number) => void;
};

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
  callbacks?: CloakProgressCallbacks,
): Promise<CloakDepositCache> {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  // Route ZK circuit fetches through our same-origin proxy to bypass S3 CORS.
  ensureCircuitsProxy();

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
      relayUrl: `${window.location.origin}/api/cloak-relay`,
      signTransaction: wallet.signTransaction,
      signMessage: wallet.signMessage,
      depositorPublicKey: wallet.publicKey,
      onProgress: (s: string) => {
        console.debug(`[cloak] ${s}`);
        callbacks?.onProgress?.(s);
      },
      onProofProgress: (p: number) => {
        console.debug(`[cloak] proof ${p}%`);
        callbacks?.onProofProgress?.(p);
      },
    } as Parameters<typeof transact>[1],
  );

  const leafIndex = result.commitmentIndices[0];
  if (leafIndex === undefined) {
    throw new Error("Deposit returned no commitment indices.");
  }

  const outputUtxos = result.outputUtxos?.length ? result.outputUtxos : [outputUtxo, zeroOut];
  for (let i = 0; i < outputUtxos.length; i++) {
    const utxo = outputUtxos[i];
    if (!utxo) continue;

    const index = result.commitmentIndices[i];
    const commitment = result.outputCommitments[i];
    const siblingCommitment = result.siblingCommitments[i];

    if (index !== undefined) utxo.index = index;
    if (commitment !== undefined) utxo.commitment = commitment;
    if (siblingCommitment !== undefined) utxo.siblingCommitment = siblingCommitment;
    if (i === 0 && result.preTransactionLeftSibling !== undefined) {
      (utxo as Utxo & { leftSiblingCommitment?: bigint }).leftSiblingCommitment =
        result.preTransactionLeftSibling;
    }
  }

  return {
    signature: result.signature,
    leafIndex,
    spendKeyHex: outputKeypair.privateKey.toString(16).padStart(64, "0"),
    blindingHex: outputUtxo.blinding.toString(16).padStart(64, "0"),
    outputUtxos,
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

function truncateSignature(signature: string) {
  return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
}

function transactionExplorerUrl(signature: string) {
  const cluster = publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER;
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

function operatorStatusMessage(reason: OperatorExecutionBlockReason) {
  if (reason === "ready") return null;
  if (reason === "license-loading") return "Checking whether this transfer is ready...";
  if (reason === "execute-vault-transaction") {
    return "The vault approval is complete. Execute the proposal before running the transfer.";
  }
  if (reason === "proposal-not-approved") {
    return "This proposal is still waiting for approvals.";
  }
  if (reason === "license-consumed") return "This transfer has already been executed.";
  if (reason === "license-expired") return "This transfer expired. Create a new proposal.";
  if (reason === "license-error") return "Could not verify this transfer on-chain.";
  return null;
}

function OperatorPageInner({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { fetchWithAuth } = useWalletAuth();
  const queryClient = useQueryClient();
  const { startTransaction, updateTransaction, updateStep, completeTransaction, failTransaction } =
    useTransactionProgress();
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
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryItem[]>([]);
  const [executing, setExecuting] = useState(false);
  const [payrollComplete, setPayrollComplete] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState<DraftSummary[]>([]);
  const [draftOnChainStatus, setDraftOnChainStatus] = useState<ProposalStatus>("loading");
  const [licenseStatus, setLicenseStatus] = useState<OperatorLicenseStatus>("idle");
  const { data: proposals = [] } = useProposalSummaries(multisig);

  const queueDrafts = useMemo(() => {
    const executedSet = new Set<string>();
    try {
      const key = `aegis:operator-executed-map:${multisig}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const map = JSON.parse(raw) as Record<string, boolean>;
        for (const [idx, val] of Object.entries(map)) {
          if (val) executedSet.add(idx);
        }
      }
    } catch {}

    return pendingDrafts
      .map((d) => {
        const proposal = proposals.find((p) => p.transactionIndex === d.transactionIndex);
        return { ...d, proposalStatus: proposal?.status ?? "unknown" };
      })
      .filter(
        (d) =>
          d.proposalStatus !== "rejected" &&
          d.proposalStatus !== "cancelled" &&
          !executedSet.has(d.transactionIndex),
      );
  }, [pendingDrafts, proposals, multisig]);
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
        fetchWithAuth(`/api/proposals/${encodeURIComponent(multisig)}`),
        fetchWithAuth(`/api/payrolls/${encodeURIComponent(multisig)}`),
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
  }, [fetchWithAuth, multisig]);

  useEffect(() => {
    const proposalCount = proposals.length;
    if (proposalCount >= 0) {
      void fetchPendingDrafts();
    }
  }, [fetchPendingDrafts, proposals]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchPendingDrafts();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchPendingDrafts]);

  useEffect(() => {
    setExecutionHistory(readExecutionHistory(multisig));
  }, [multisig]);

  // Auto-mark as executed if license is already consumed (backfill for lost history)
  useEffect(() => {
    if (licenseStatus === "consumed" && txIndex) {
      markProposalExecuted(multisig, txIndex);
    }
  }, [licenseStatus, txIndex, multisig]);

  const recordExecution = useCallback(
    (item: Omit<ExecutionHistoryItem, "id" | "createdAt">) => {
      const nextItem: ExecutionHistoryItem = {
        ...item,
        id: `${Date.now()}-${item.transactionIndex}-${item.status}`,
        createdAt: new Date().toISOString(),
      };
      setExecutionHistory((current) => {
        const next = [nextItem, ...current].slice(0, 20);
        writeExecutionHistory(multisig, next);
        return next;
      });
    },
    [multisig],
  );

  const operatorMismatch = useMemo(() => {
    if (!registeredOperator || !wallet.publicKey) return false;
    return registeredOperator !== wallet.publicKey.toBase58();
  }, [registeredOperator, wallet.publicKey]);

  // Fetch a draft with includeSensitive=true, falling back to non-sensitive view on 403
  // (so non-operator wallets can still load the draft for review without exposing claims).
  async function fetchDraftWithFallback(baseUrl: string): Promise<Response> {
    const sensitiveUrl = `${baseUrl}?includeSensitive=true`;
    const sensitiveResponse = await fetchWithAuth(sensitiveUrl);
    if (sensitiveResponse.status !== 403) return sensitiveResponse;
    return fetchWithAuth(baseUrl);
  }

  async function loadDraft() {
    if (!txIndex || !multisig) return;
    setLoadedDraft(null);
    setPayrollDraft(null);
    setError(null);
    setSignature(null);
    setWithdrawSignature(null);
    setExecutionSteps([]);
    setPayrollComplete(false);
    setLicenseStatus("idle");

    try {
      // Try single draft first (fall back to non-sensitive view if wallet is not the operator)
      const singleResponse = await fetchDraftWithFallback(
        `/api/proposals/${encodeURIComponent(multisig)}/${encodeURIComponent(txIndex)}`,
      );
      if (singleResponse.ok) {
        const draft = (await singleResponse.json()) as SingleDraft;
        setLoadedDraft(draft);
        void checkOnChainStatus(txIndex, draft);
        return;
      }

      // Try payroll draft
      const payrollResponse = await fetchDraftWithFallback(
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
    _attempt = 0,
    suppressProgress = false,
  ) {
    if (!wallet.publicKey || !multisigAddress) return;

    const transferLabel = draft.recipient
      ? ` to ${draft.recipient.slice(0, 4)}...${draft.recipient.slice(-4)}`
      : invoiceId
        ? " for invoice claim"
        : "";
    if (!suppressProgress) startTransaction({
      title: isPayroll ? "Executing payroll transfer" : "Executing private transfer",
      description: `${lamportsToSol(draft.invariants.amount)} SOL${transferLabel}. This may take longer while the privacy shield is prepared.`,
      steps: [
        {
          id: "prepare",
          title: "Prepare private execution",
          description: "Reconstructing the approved Cloak commitment and checking cached work.",
        },
        {
          id: "deposit",
          title: "Deposit into Cloak",
          description: "Submitting the shielded deposit transaction.",
          status: "pending",
        },
        {
          id: "deliver",
          title: draft.recipient ? "Deliver to recipient" : "Store claim data",
          description: draft.recipient
            ? "Securing the withdrawal and sending funds to the recipient."
            : "Saving the private UTXO data so the invoice can be claimed.",
          status: "pending",
        },
        {
          id: "license",
          title: "Finalize transfer",
          description: "Submitting the approved transfer on-chain.",
          status: "pending",
        },
      ],
    });

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
        updateStep("prepare", { status: "running" });
        const cachedDeposit = readCloakDepositCache(multisigAddress.toBase58(), depositCacheKey);
        let cloakResult: Awaited<ReturnType<typeof cloakDepositBrowser>>;

        if (cachedDeposit) {
          cloakResult = cachedDeposit;
          updateStep("prepare", {
            status: "success",
            description: "Found completed Cloak work from a previous attempt.",
          });
          updateStep("deposit", {
            status: "success",
            signature: cachedDeposit.signature,
            description: "Cloak deposit already confirmed.",
          });
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
          updateStep("prepare", {
            status: "success",
            description: "Approved commitment matches the reconstructed Cloak UTXO.",
          });
          updateStep("deposit", { status: "running" });
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
            {
              onProgress: (message) => updateTransaction({ detail: translateCloakProgress(message) }),
              onProofProgress: (progress) => updateTransaction({ proofProgress: progress }),
            },
          );
        } else {
          throw new Error("Proposal draft is missing the Cloak UTXO claim. Create a new proposal.");
        }

        cloakSig = cloakResult.signature;
        setCloakSignature(cloakSig);
        updateStep("deposit", {
          status: "success",
          signature: cloakSig,
          description: "Shielded deposit confirmed.",
        });

        // F4 invoice mode: use explicit invoiceId param or fall back to legacy commitmentClaim lookup
        const effectiveInvoiceId = invoiceId ?? draft.commitmentClaim?.invoiceId;

        if (effectiveInvoiceId) {
          updateStep("deliver", { status: "running" });
          // F4: store UTXO data for recipient claim.
          try {
            const storeResponse = await fetchWithAuth(`/api/stealth/${effectiveInvoiceId}/utxo`, {
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
                utxoSiblingCommitment: cloakResult.outputUtxos?.[0]?.siblingCommitment
                  ?.toString(16)
                  .padStart(64, "0"),
                utxoLeftSiblingCommitment: (
                  cloakResult.outputUtxos?.[0] as
                    | (Utxo & { leftSiblingCommitment?: bigint })
                    | undefined
                )?.leftSiblingCommitment
                  ?.toString(16)
                  .padStart(64, "0"),
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
          updateStep("deliver", {
            status: "success",
            description: "Invoice claim data saved.",
          });
        } else if (draft.recipient) {
          updateStep("deliver", { status: "running" });
          // F1: withdraw directly to recipient, no claim needed.
          if (cachedDeposit) {
            // Deposit + withdraw already completed in a prior attempt.
            // Skip fullWithdraw and proceed to execute_with_license below.
            updateStep("deliver", {
              status: "success",
              description: "Delivery already completed in a previous attempt.",
            });
          } else {
            if (!cloakResult.outputUtxos?.length) {
              throw new Error("Cloak deposit did not return spendable UTXO data.");
            }
            const recipientPubkey = new PublicKey(draft.recipient);
            const withdrawOptions = {
              connection,
              programId: CLOAK_PROGRAM_ID,
              ...cloakDirectTransactOptions,
              relayUrl: `${window.location.origin}/api/cloak-relay`,
              signTransaction: wallet.signTransaction as Parameters<
                typeof fullWithdraw
              >[2]["signTransaction"],
              ...(wallet.signMessage ? { signMessage: wallet.signMessage } : {}),
              depositorPublicKey: wallet.publicKey,
              ...(cloakResult.merkleTree ? { cachedMerkleTree: cloakResult.merkleTree } : {}),
              onProgress: (s: string) => {
                console.debug(`[cloak] withdraw ${s}`);
                updateTransaction({ detail: translateCloakProgress(s) });
              },
              onProofProgress: (p: number) => {
                console.debug(`[cloak] withdraw proof ${p}%`);
                updateTransaction({ proofProgress: p });
              },
            } as Parameters<typeof fullWithdraw>[2];
            const withdrawResult = await fullWithdraw(cloakResult.outputUtxos, recipientPubkey, {
              ...withdrawOptions,
            });
            setWithdrawSignature(withdrawResult.signature);
            updateStep("deliver", {
              status: "success",
              signature: withdrawResult.signature,
              description: "Funds delivered to the recipient.",
            });
            // Cache after successful withdraw so retries skip deposit+withdraw and only
            // re-run execute_with_license (prevents double-deposit on operator retry).
            writeCloakDepositCache(multisigAddress.toBase58(), depositCacheKey, cloakResult);
          }
        } else if (!cachedDeposit) {
          writeCloakDepositCache(multisigAddress.toBase58(), depositCacheKey, cloakResult);
          updateStep("deliver", { status: "success", description: "Cloak deposit cached." });
        }
      } catch (caught) {
        const msg = caught instanceof Error ? caught.message : String(caught);
        if (msg.includes("stale") && _attempt < 2) {
          updateTransaction({ detail: "Note index stale, refreshing and retrying..." });
          await new Promise<void>((resolve) => { setTimeout(resolve, 2000); });
          return executeSingle(draft, doCloakDeposit, depositCacheKey, invoiceId, _attempt + 1);
        }
        const message = `Cloak deposit failed: ${msg}`;
        failTransaction(message);
        throw new Error(message);
      }
    } else {
      updateStep("prepare", { status: "success" });
      updateStep("deposit", { status: "success", description: "Cloak deposit not required." });
      updateStep("deliver", { status: "success", description: "Delivery step not required." });
    }

    updateStep("license", { status: "running" });
    const ix = await buildExecuteWithLicenseIxBrowser({
      multisig: multisigAddress,
      operator: wallet.publicKey,
      invariants: { nullifier, commitment, amount, tokenMint, recipientVkPub, nonce },
    });

    const { budgetIxs, simulationErr, logs: simLogs } = await simulateAndOptimize({
      connection,
      instructions: [ix],
      payer: wallet.publicKey,
      writableAccounts: [multisigAddress],
    });
    if (simulationErr) {
      const raw = `${JSON.stringify(simulationErr)}\n${simLogs.join("\n")}`.trim();
      throw new Error(raw);
    }
    const tx = new Transaction().add(...budgetIxs, ix);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const sig = await wallet.sendTransaction(tx, connection);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    updateStep("license", {
      status: "success",
      signature: sig,
      description: "License consumed and private execution finalized.",
    });
    if (!suppressProgress) {
      completeTransaction({
        title: "Private transfer complete",
        description: "All required on-chain transactions for this transfer are confirmed.",
      });
    }

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
        recordExecution({
          transactionIndex: txIndex,
          type: "single",
          recipient: loadedDraft.recipient,
          amount: loadedDraft.amount,
          status: "success",
          ...(sig ? { signature: sig } : {}),
          ...(cloakSignature ? { cloakSignature } : {}),
          ...(withdrawSignature ? { withdrawSignature } : {}),
        });
        markProposalExecuted(multisig, txIndex);
        void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      } else if (payrollDraft) {
        // Chained execution
        await executePayroll();
      } else {
        throw new Error("Load a proposal draft first.");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not execute transfer.";
      setError(message);
      recordExecution({
        transactionIndex: txIndex,
        type: payrollDraft ? "payroll" : "single",
        ...(loadedDraft?.recipient ? { recipient: loadedDraft.recipient } : {}),
        ...(payrollDraft?.recipientCount ? { recipientCount: payrollDraft.recipientCount } : {}),
        amount: loadedDraft?.amount ?? payrollDraft?.totalAmount ?? "0",
        status: "error",
        error: message,
      });
      failTransaction(message);
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
    let completed = 0;
    let lastError: string | undefined;
    let lastSig: string | undefined;

    startTransaction({
      title: "Executing payroll batch",
      description: `Processing ${payrollDraft.recipients.length} private transfer${payrollDraft.recipients.length !== 1 ? "s" : ""}.`,
      steps: [{ id: "batch", title: "Batch execution in progress", description: "Each recipient is processed sequentially.", status: "running" }],
    });

    for (let i = 0; i < payrollDraft.recipients.length; i++) {
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
          0,
          true, // suppressProgress — payroll manages its own overlay
        );

        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "success", signature: sig } : s)),
        );
        completed += 1;
        if (sig) lastSig = sig;
      } catch (caught) {
        const errorMsg = caught instanceof Error ? caught.message : "Execution failed";
        lastError = errorMsg;
        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "error", error: errorMsg } : s)),
        );
        break;
      }
    }

    setExecuting(false);
    const payrollStatus = completed === payrollDraft.recipientCount ? "success" : "error";
    recordExecution({
      transactionIndex: txIndex,
      type: "payroll",
      recipientCount: payrollDraft.recipientCount,
      amount: payrollDraft.totalAmount,
      status: payrollStatus,
      ...(completed === payrollDraft.recipientCount
        ? {}
        : {
            error: lastError ?? `Executed ${completed}/${payrollDraft.recipientCount} recipients.`,
          }),
    });

    if (payrollStatus === "success") {
      completeTransaction({
        title: `Payroll complete — ${completed} transfer${completed !== 1 ? "s" : ""} confirmed`,
        description: "All private payroll transfers have been executed on-chain.",
      });
      setPayrollComplete(true);
      if (lastSig) setSignature(lastSig);
      markProposalExecuted(multisig, txIndex);
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
    } else {
      failTransaction(lastError ?? `Executed ${completed}/${payrollDraft.recipientCount} recipients.`);
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

    const totalRecipients = payrollDraft.recipients.length;
    // Count already-succeeded steps (before startIndex) using local snapshot to avoid stale reads
    const alreadyDone = executionSteps.filter((s) => s.index < startIndex && s.status === "success").length;
    let completed = alreadyDone;
    let lastSig: string | undefined;

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
          0,
          true, // suppressProgress
        );

        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "success", signature: sig } : s)),
        );
        completed += 1;
        if (sig) lastSig = sig;
      } catch (caught) {
        const errorMsg = caught instanceof Error ? caught.message : "Execution failed";
        setExecutionSteps((prev) =>
          prev.map((s) => (s.index === i ? { ...s, status: "error", error: errorMsg } : s)),
        );
        break;
      }
    }

    setExecuting(false);

    if (completed === totalRecipients) {
      completeTransaction({
        title: `Payroll complete — ${completed} transfer${completed !== 1 ? "s" : ""} confirmed`,
        description: "All private payroll transfers have been executed on-chain.",
      });
      setPayrollComplete(true);
      if (lastSig) setSignature(lastSig);
      markProposalExecuted(multisig, txIndex);
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
    }
  }

  const successCount = executionSteps.filter((s) => s.status === "success").length;
  const isPayroll = payrollDraft !== null;
  const lowOperatorSol = operatorBalanceLamports !== null && operatorBalanceLamports < 10_000_000;

  // Budget calculation: total SOL needed for all pending drafts
  const totalNeededLamports = queueDrafts.reduce((sum, draft) => {
    const amt = BigInt(
      draft.type === "payroll" ? (draft.totalAmount ?? "0") : (draft.amount ?? "0"),
    );
    return sum + amt;
  }, 0n);
  const operatorBalBigInt = BigInt(operatorBalanceLamports ?? 0);
  const deficitLamports = totalNeededLamports > operatorBalBigInt
    ? totalNeededLamports - operatorBalBigInt
    : 0n;
  const hasDeficit = deficitLamports > 0n;

  const [helpOpen, setHelpOpen] = useState(false);

  const executionState = getOperatorExecutionState({
    hasDraft: !!(loadedDraft || payrollDraft),
    walletConnected: !!wallet.publicKey,
    operatorMismatch,
    cofreMissing,
    lowOperatorSol,
    proposalStatus: draftOnChainStatus,
    licenseStatus,
  });
  const canExecute = !pending && !signature && !payrollComplete && executionState.canExecute;
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

  if (operatorMismatch && wallet.publicKey) {
    const connected = wallet.publicKey.toBase58();

    return (
      <WorkspacePage>
        <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center px-4">
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-signal-danger/20 bg-signal-danger/5">
            <ShieldX className="h-8 w-8 text-signal-danger" strokeWidth={1.5} />
          </div>

          {/* Heading */}
          <div className="mt-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-signal-danger">
              Access restricted
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">
              Wrong wallet connected
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-ink-muted">
              The execution queue requires the registered operator wallet.
              Connect the correct wallet to continue.
            </p>
          </div>

          {/* Wallet comparison */}
          <div className="mt-10 w-full max-w-md space-y-2">
            {/* Connected (wrong) */}
            <div className="flex items-start gap-3 rounded-xl border border-signal-danger/30 bg-signal-danger/5 px-4 py-3.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-signal-danger/40 bg-signal-danger/10">
                <span className="text-[10px] font-bold leading-none text-signal-danger">✕</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-signal-danger/70">
                  Connected
                </p>
                <p className="mt-0.5 break-all font-mono text-xs text-ink" title={connected}>
                  {connected}
                </p>
              </div>
            </div>

            {/* Operator (required) */}
            {registeredOperator ? (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
                  <span className="text-[10px] font-bold leading-none text-accent">✓</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                    Required operator
                  </p>
                  <p
                    className="mt-0.5 break-all font-mono text-xs text-ink"
                    title={registeredOperator}
                  >
                    {registeredOperator}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/vault/${multisig}`}
              className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Back to vault
            </Link>
            <Button
              type="button"
              onClick={() => {
                void wallet.disconnect();
              }}
            >
              Change wallet
            </Button>
          </div>

        </div>
      </WorkspacePage>
    );
  }

  const statusDot = (status: string) => {
    if (status === "active" || status === "approved") return "bg-accent";
    if (status === "executed") return "bg-signal-positive";
    if (status === "rejected" || status === "cancelled") return "bg-signal-danger";
    return "bg-ink-subtle";
  };

  const statusLabel = (status: string) => {
    if (status === "active") return "Awaiting";
    if (status === "approved") return "Ready";
    if (status === "executed") return "Executed";
    if (status === "rejected") return "Rejected";
    if (status === "cancelled") return "Cancelled";
    return status;
  };

  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Operator"
          title="Execution queue"
          description="Run private transfers after the vault has approved them. Load an approved proposal, review the intent, then execute."
          action={
            <div className="flex items-center gap-2">
              <StatusPill tone="accent">{queueDrafts.length} ready</StatusPill>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-bold text-ink-subtle transition-colors hover:border-border-strong hover:text-ink"
                aria-label="How operator budget works"
              >
                ?
              </button>
            </div>
          }
        />

        {/* Minimal stats bar */}
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">Balance</span>
            <span className={`font-semibold ${hasDeficit ? "text-signal-danger" : "text-ink"}`}>
              {operatorBalanceLoading
                ? "..."
                : operatorBalanceLamports === null
                  ? "—"
                  : `${lamportsToSol(operatorBalanceLamports)} SOL`}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">Needed</span>
            <span className="font-semibold text-ink">
              {totalNeededLamports > 0n ? `${lamportsToSol(totalNeededLamports)} SOL` : "—"}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">Vault</span>
            <span className={`font-semibold ${cofreMissing ? "text-signal-warn" : "text-accent"}`}>
              {cofreMissing ? "Needs setup" : "Ready"}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">Queue</span>
            <span className="font-semibold text-ink">{queueDrafts.length}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">Wallet</span>
            <span
              className={`font-semibold ${operatorMismatch ? "text-signal-danger" : "text-accent"}`}
            >
              {operatorMismatch ? "Mismatch" : "Matched"}
            </span>
          </div>
        </div>

        {hasDeficit && !operatorBalanceLoading && (
          <InlineAlert tone="warning">
            Insufficient operator balance. Need{" "}
            <span className="font-semibold">{lamportsToSol(deficitLamports)} SOL</span> more
            to execute all pending transfers. The vault funds the operator automatically when proposals are created.
          </InlineAlert>
        )}
        {operatorMismatch && wallet.publicKey ? (
          <InlineAlert tone="warning">
            <div className="space-y-1">
              <div>The connected wallet is not the registered operator. Switch wallets before executing.</div>
              <div className="font-mono text-[11px] leading-5">
                <div>
                  <span className="text-ink-subtle">Connected:</span>{" "}
                  <span className="break-all">{wallet.publicKey.toBase58()}</span>
                </div>
                {registeredOperator ? (
                  <div>
                    <span className="text-ink-subtle">Operator:</span>{" "}
                    <span className="break-all">{registeredOperator}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </InlineAlert>
        ) : null}
        {lowOperatorSol && !hasDeficit ? (
          <InlineAlert tone="warning">
            Add a little SOL to the operator wallet for network fees.
          </InlineAlert>
        ) : null}
        {cofreMissing ? (
          <InlineAlert tone="warning">
            Private vault is not ready yet. Finish the vault setup proposal before running private
            transfers.
          </InlineAlert>
        ) : null}

        {/* Main execution card */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-raise-1">
          {!loadedDraft && !payrollDraft ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Execution queue</h2>
                  <p className="text-xs text-ink-muted">
                    Load an approved proposal to execute the private transfer.
                  </p>
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <Label htmlFor="txIndex" className="text-xs">
                      Proposal #
                    </Label>
                    <Input
                      id="txIndex"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      value={txIndex}
                      onChange={(e) => setTxIndex(e.target.value)}
                      placeholder="4"
                      className="mt-1 w-24 font-mono"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void loadDraft()}
                    disabled={!txIndex}
                    className="mt-1"
                  >
                    Load
                  </Button>
                </div>
              </div>

              {queueDrafts.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-ink-muted">No pending drafts</p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    Approved proposals will appear here.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="grid items-center gap-4 border-b border-border/50 px-5 py-2"
                    style={{ gridTemplateColumns: "3rem 6rem 1fr 8rem 6rem 5rem" }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                      #
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                      Type
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                      Details
                    </span>
                    <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                      Amount
                    </span>
                    <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                      Status
                    </span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {queueDrafts.map((d) => (
                      <div
                        key={d.id}
                        className="grid items-center gap-4 px-5 py-3"
                        style={{ gridTemplateColumns: "3rem 6rem 1fr 8rem 6rem 5rem" }}
                      >
                        <span className="font-mono text-sm text-ink-subtle">
                          #{d.transactionIndex}
                        </span>
                        <span
                          className={`inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            d.type === "payroll"
                              ? "bg-accent-soft text-accent"
                              : "bg-surface-2 text-ink-muted"
                          }`}
                        >
                          {d.type.toUpperCase()}
                        </span>
                        <p className="truncate text-sm text-ink">
                          {d.type === "payroll"
                            ? `${d.recipientCount ?? 0} recipients`
                            : d.recipient
                              ? `${d.recipient.slice(0, 8)}...${d.recipient.slice(-8)}`
                              : "Transfer"}
                        </p>
                        <p className="text-right font-mono text-sm text-ink">
                          {lamportsToSol(d.totalAmount ?? d.amount)} SOL
                        </p>
                        <div className="flex items-center justify-end gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${statusDot((d as unknown as { proposalStatus?: string }).proposalStatus ?? "unknown")}`}
                          />
                          <span className="text-xs text-ink-muted">
                            {statusLabel(
                              (d as unknown as { proposalStatus?: string }).proposalStatus ??
                                "unknown",
                            )}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="secondary"
                            className="text-xs px-2 py-1 h-auto"
                            onClick={() => {
                              setTxIndex(d.transactionIndex);
                              void (async () => {
                                setLoadedDraft(null);
                                setPayrollDraft(null);
                                setError(null);
                                setSignature(null);
                                setExecutionSteps([]);
                                try {
                                  const singleResponse = await fetchDraftWithFallback(
                                    `/api/proposals/${encodeURIComponent(multisig)}/${encodeURIComponent(d.transactionIndex)}`,
                                  );
                                  if (singleResponse.ok) {
                                    const draft = (await singleResponse.json()) as SingleDraft;
                                    setLoadedDraft(draft);
                                    void checkOnChainStatus(d.transactionIndex, draft);
                                    return;
                                  }
                                  const payrollResponse = await fetchDraftWithFallback(
                                    `/api/payrolls/${encodeURIComponent(multisig)}/${encodeURIComponent(d.transactionIndex)}`,
                                  );
                                  if (payrollResponse.ok) {
                                    const draft = (await payrollResponse.json()) as PayrollDraft;
                                    setPayrollDraft(draft);
                                    setExecutionSteps(
                                      draft.recipients.map((_, i) => ({
                                        index: i,
                                        status: "pending",
                                      })),
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
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Proposal #{txIndex}</h2>
                  <p className="text-xs text-ink-muted">
                    {isPayroll
                      ? `${payrollDraft?.recipientCount} recipients`
                      : `${lamportsToSol(loadedDraft?.amount ?? "0")} SOL`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoadedDraft(null);
                    setPayrollDraft(null);
                    setTxIndex("");
                    setError(null);
                    setSignature(null);
                    setCloakSignature(null);
                    setWithdrawSignature(null);
                    setExecutionSteps([]);
                  }}
                  className="text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
                >
                  Back to queue
                </button>
              </div>
              <div className="p-5 space-y-5">
                {/* Transfer details / Payroll table */}
                {loadedDraft && !isPayroll && (
                  <dl className="grid gap-2 text-sm">
                    <DetailRow label="Amount" value={`${lamportsToSol(loadedDraft.amount)} SOL`} />
                    <DetailRow label="Recipient" value={loadedDraft.recipient} mono />
                    <DetailRow label="Status" value={proposalStatusMessage ?? "Ready to execute"} />
                  </dl>
                )}

                {isPayroll && payrollDraft && (
                  <div>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-bg text-left">
                            <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              #
                            </th>
                            <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              Name
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              Amount
                            </th>
                            <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/70">
                          {payrollDraft.recipients.map((r, i) => {
                            const step = executionSteps[i];
                            return (
                              <tr key={r.id}>
                                <td className="px-3 py-2 text-ink-muted">{i + 1}</td>
                                <td className="px-3 py-2 text-ink">{r.name}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">
                                  {lamportsToSol(r.amount)} SOL
                                </td>
                                <td className="px-3 py-2">
                                  {!step || step.status === "pending" ? (
                                    <span className="text-ink-muted">Pending</span>
                                  ) : step.status === "running" ? (
                                    <span className="text-signal-warn">Running…</span>
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
                          <ProgressBar value={successCount} max={payrollDraft.recipientCount} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Execute form — hidden after successful single or payroll execution */}
                {!signature && !payrollComplete && (
                  <form onSubmit={execute} className="space-y-2">
                    <Button type="submit" disabled={!canExecute}>
                      {pending
                        ? isPayroll
                          ? "Executing batch…"
                          : "Executing…"
                        : isPayroll
                          ? "Execute batch"
                          : "Execute transfer"}
                    </Button>
                    {!wallet.publicKey ? (
                      <p className="text-xs text-signal-warn">
                        Connect the registered operator wallet.
                      </p>
                    ) : null}
                    {operatorMismatch && wallet.publicKey ? (
                      <div className="text-xs text-signal-warn space-y-1">
                        <p>Connected wallet is not the registered operator.</p>
                        {registeredOperator ? (
                          <p className="font-mono text-[11px] break-all text-ink-subtle">
                            Operator: {registeredOperator}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {lowOperatorSol ? (
                      <p className="text-xs text-signal-warn">Add SOL to cover network fees.</p>
                    ) : null}
                    {cofreMissing ? (
                      <p className="text-xs text-signal-warn">Finish private vault setup first.</p>
                    ) : null}
                  </form>
                )}

                {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

                {/* Payroll complete — per-recipient explorer links */}
                {isPayroll && payrollComplete && executionSteps.some((s) => s.signature) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-signal-positive">
                      Payroll complete — {executionSteps.filter((s) => s.status === "success").length}/{executionSteps.length} transfers confirmed
                    </p>
                    {executionSteps
                      .filter((s) => s.signature)
                      .map((s) => {
                        const recipient = payrollDraft?.recipients[s.index];
                        return (
                          <div
                            key={s.index}
                            className="flex flex-col gap-2 rounded-md border border-border bg-bg px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <dt className="text-sm text-ink-muted">
                              {recipient?.name ?? `Recipient ${s.index + 1}`}
                            </dt>
                            <dd className="flex items-center gap-2">
                              <code className="font-mono text-xs text-ink">
                                {truncateSignature(s.signature!)}
                              </code>
                              <a
                                href={transactionExplorerUrl(s.signature!)}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                              >
                                Explorer
                              </a>
                            </dd>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Latest confirmed transactions (single transfer) */}
                {!isPayroll && (cloakSignature || signature || withdrawSignature) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-ink">Latest confirmed transactions</p>
                    {[
                      cloakSignature ? { label: "Cloak deposit", value: cloakSignature } : null,
                      withdrawSignature
                        ? { label: "Recipient delivery", value: withdrawSignature }
                        : null,
                      signature ? { label: "License consumption", value: signature } : null,
                    ]
                      .filter((item): item is { label: string; value: string } => Boolean(item))
                      .map((item) => (
                        <div
                          key={item.label}
                          className="flex flex-col gap-2 rounded-md border border-border bg-bg px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <dt className="text-sm text-ink-muted">{item.label}</dt>
                          <dd className="flex items-center gap-2">
                            <code className="font-mono text-xs text-ink">
                              {truncateSignature(item.value)}
                            </code>
                            <a
                              href={transactionExplorerUrl(item.value)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                            >
                              Explorer
                            </a>
                          </dd>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Execution history */}
        {executionHistory.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-raise-1">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">Execution history</h2>
                <p className="text-xs text-ink-muted">
                  Browser-local record of recent operator runs.
                </p>
              </div>
            </div>
            <div
              className="grid items-center gap-4 border-b border-border/50 px-5 py-2"
              style={{ gridTemplateColumns: "3rem 6rem 1fr 8rem 5rem" }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                #
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                Status
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                Details
              </span>
              <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                Amount
              </span>
              <span />
            </div>
            <div className="divide-y divide-border/40">
              {executionHistory.map((item) => (
                <div
                  key={item.id}
                  className="grid items-center gap-4 px-5 py-3"
                  style={{ gridTemplateColumns: "3rem 6rem 1fr 8rem 5rem" }}
                >
                  <span className="font-mono text-sm text-ink-subtle">
                    #{item.transactionIndex}
                  </span>
                  <StatusPill tone={item.status === "success" ? "success" : "danger"}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </StatusPill>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {item.type === "payroll"
                        ? `${item.recipientCount ?? 0} recipients`
                        : item.recipient
                          ? `${item.recipient.slice(0, 8)}...${item.recipient.slice(-8)}`
                          : "single transfer"}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {new Date(item.createdAt).toLocaleString()}
                      {item.error ? ` · ${item.error}` : ""}
                    </p>
                  </div>
                  <p className="text-right font-mono text-sm text-ink">
                    {lamportsToSol(item.amount)} SOL
                  </p>
                  <div className="flex justify-end">
                    {item.signature ? (
                      <a
                        href={transactionExplorerUrl(item.signature)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                      >
                        Explorer
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Help modal */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent size="md" autoClose={false}>
          <DialogHeader>
            <DialogTitle>How operator budget works</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-4 text-sm text-ink-muted">
            <div className="space-y-2">
              <p className="font-semibold text-ink">Why does the operator need SOL?</p>
              <p>
                Private transfers use <span className="font-medium text-ink">Cloak</span>, a
                privacy-shielded pool. The Cloak protocol requires a wallet with a private
                key to sign deposits. Because the vault PDA has no private key, the{" "}
                <span className="font-medium text-ink">operator's wallet</span> deposits into
                Cloak on behalf of the vault. This also severs the on-chain link between the
                vault and the payment.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-4 font-mono text-xs leading-relaxed">
              <p className="text-ink-subtle">Private payment flow:</p>
              <p className="mt-2 text-ink">Vault → Operator (auto-funded in proposal)</p>
              <p className="text-ink">Operator wallet → Cloak pool</p>
              <p className="text-ink-subtle">↓ (privacy shield keeps amount and recipient hidden)</p>
              <p className="text-ink">Cloak pool → Recipient</p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-ink">How operator funding works</p>
              <p>
                Every private proposal (send, invoice, payroll) now includes an automatic{" "}
                <span className="font-medium text-ink">vault → operator transfer</span> alongside
                the license instruction. When the team approves and executes the proposal, the
                operator receives the SOL needed for the Cloak deposit. No manual top-up required.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-ink">What the operator still needs</p>
              <p>
                The operator only needs a small amount of SOL for{" "}
                <span className="font-medium text-ink">transaction fees</span> (rent exemption +
                gas). The transfer amount itself comes from the vault automatically.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </WorkspacePage>
  );
}

export default function OperatorPage({ params }: { params: Promise<{ multisig: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <OperatorPageInner params={params} />
    </Suspense>
  );
}

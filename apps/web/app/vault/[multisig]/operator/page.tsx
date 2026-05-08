"use client";

import { Button } from "@/components/ui/button";
import { useTransactionProgress } from "@/components/ui/transaction-progress";
import {
  InlineAlert,
  ProgressBar,
  StatusPill,
  WorkspacePage,
} from "@/components/ui/workspace";
import {
  Check,
  ChevronRight,
  History,
  Inbox,
  Key,
  Send,
  ShieldCheck,
  ShieldX,
  Users,
  X as XIcon,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptRow } from "@/components/ui/receipt-row";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { truncateAddress } from "@/lib/proposals";
import { cn } from "@/lib/utils";

import { ensureCircuitsProxy, prefetchCircuits } from "@/lib/cloak-circuits-proxy";
import { translateCloakProgress } from "@/lib/cloak-progress";
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
  type CloakDepositCache,
  cloakDepositCacheKey,
  deserializeCacheEntry,
  serializeCacheEntry,
} from "@/lib/operator-deposit-cache";
import {
  type OperatorExecutionBlockReason,
  type OperatorLicenseStatus,
  type ProposalStatus,
  getOperatorExecutionState,
  normalizeLicenseStatus,
} from "@/lib/operator-license-state";
import { lamportsToSol } from "@/lib/sol";
import { SOL_MINT, formatRawAmount } from "@/lib/tokens";
import { simulateAndOptimize } from "@/lib/tx-optimization";
import { proposalSummariesQueryKey, useProposalSummaries } from "@/lib/use-proposal-summaries";
import { useUnloadGuard } from "@/lib/use-unload-guard";
import { useWalletAuth } from "@/lib/use-wallet-auth";
import { cloakDirectTransactOptions } from "@cloak-squads/core/cloak-direct-mode";
import { computePayloadHash } from "@cloak-squads/core/hashing";
import { decryptMemo } from "@cloak-squads/core/memo-crypto";
import { cofrePda, licensePda } from "@cloak-squads/core/pda";
import {
  CLOAK_PROGRAM_ID,
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
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, type VersionedTransaction } from "@solana/web3.js";
import * as squadsMultisig from "@sqds/multisig";
import { useQueryClient } from "@tanstack/react-query";
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
  // "private" — needs operator delivery; "public" — plain transfer, no operator step.
  kind?: "private" | "public";
  recipientCount?: number;
  totalAmount?: string;
  invariants?: { tokenMint?: string };
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
  memoBoxSk?: string;
};

type SingleDraft = {
  amount: string;
  recipient: string;
  memo: string;
  memoCiphertext?: number[];
  memoNonce?: number[];
  memoEphemeralPk?: number[];
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

type DraftInvariants = SingleDraft["invariants"];

type CloakProgressCallbacks = {
  onProgress?: (message: string) => void;
};

type DecodedLicense = {
  status?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
};

function readCloakDepositCache(
  multisig: string,
  transactionIndex: string,
): CloakDepositCache | null {
  try {
    const raw = sessionStorage.getItem(cloakDepositCacheKey(multisig, transactionIndex));
    if (!raw) return null;
    return deserializeCacheEntry(JSON.parse(raw));
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
    sessionStorage.setItem(
      cloakDepositCacheKey(multisig, transactionIndex),
      JSON.stringify(serializeCacheEntry(value)),
    );
  } catch {
    // Best effort cache only; execution can continue without it.
  }
}

// TODO(operator-cache): sessionStorage is per-tab — closing the tab between
// deposit and Finalize loses the cache and a retry will re-deposit. Persist
// {leafIndex, depositSig, withdrawn, withdrawSignature} server-side on the
// proposal record (operator-only) for full robustness across sessions.

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
  // True while fetching a draft (click on inbox row OR URL deeplink).
  // Detail panel renders a skeleton while this is true so the operator
  // sees a deliberate "loading" state instead of stale data or a blank.
  const [draftLoading, setDraftLoading] = useState(false);
  const [registeredOperator, setRegisteredOperator] = useState<string | null>(null);
  const [cofreMissing, setCofreMissing] = useState(false);
  const [operatorBalanceLamports, setOperatorBalanceLamports] = useState<number | null>(null);
  const [operatorBalanceLoading, setOperatorBalanceLoading] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryItem[]>([]);
  const [executing, setExecuting] = useState(false);

  // Block tab close while a ZK proof / transaction is in progress.
  useUnloadGuard(executing);
  const [payrollComplete, setPayrollComplete] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);
  const [refundSignature, setRefundSignature] = useState<string | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<DraftSummary[]>([]);
  const [draftOnChainStatus, setDraftOnChainStatus] = useState<ProposalStatus>("loading");
  const [licenseStatus, setLicenseStatus] = useState<OperatorLicenseStatus>("idle");
  const [executedMap, setExecutedMap] = useState<Record<string, boolean>>({});
  const { data: proposals = [] } = useProposalSummaries(multisig);

  useEffect(() => {
    if (!multisig) return;
    const readMap = () => {
      try {
        const raw = localStorage.getItem(`aegis:operator-executed-map:${multisig}`);
        setExecutedMap(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
      } catch {
        setExecutedMap({});
      }
    };
    readMap();
    window.addEventListener("aegis:operator-executed", readMap);
    return () => window.removeEventListener("aegis:operator-executed", readMap);
  }, [multisig]);

  // Decrypt memo from commitmentClaim if present
  const decryptedMemo = useMemo(() => {
    if (!loadedDraft) return null;
    if (loadedDraft.memo) return loadedDraft.memo;
    if (
      !loadedDraft.memoCiphertext ||
      !loadedDraft.memoNonce ||
      !loadedDraft.memoEphemeralPk ||
      !loadedDraft.commitmentClaim?.memoBoxSk
    ) {
      return null;
    }
    try {
      return decryptMemo(
        {
          ciphertext: Uint8Array.from(loadedDraft.memoCiphertext),
          nonce: Uint8Array.from(loadedDraft.memoNonce),
          ephemeralPk: Uint8Array.from(loadedDraft.memoEphemeralPk),
        },
        Buffer.from(loadedDraft.commitmentClaim.memoBoxSk, "hex"),
      );
    } catch {
      return "[encrypted memo]";
    }
  }, [loadedDraft]);

  const queueDrafts = useMemo(() => {
    // Operator's queue must INCLUDE proposals whose status is "executed" —
    // that's the exact moment when the operator becomes the next signer:
    // multisig has run vaultTransactionExecute, but the Cloak shielded
    // delivery hasn't fired yet. We only hide an executed item once the
    // operator has run their step (tracked locally in executedMap).
    //
    // We still hide rejected/cancelled (dead proposals) and "executing"
    // (transient state during the multisig submit).
    return pendingDrafts
      .map((d) => {
        const proposal = proposals.find((p) => p.transactionIndex === d.transactionIndex);
        return { ...d, proposalStatus: proposal?.status ?? "unknown" };
      })
      .filter(
        (d) =>
          d.proposalStatus !== "rejected" &&
          d.proposalStatus !== "cancelled" &&
          d.proposalStatus !== "executing" &&
          !executedMap[d.transactionIndex],
      );
  }, [pendingDrafts, proposals, executedMap]);
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

  // Pre-fetch ZK circuits the moment the operator dashboard opens.
  // The operator will likely run a deposit (transact) in this session — having
  // the wasm + zkey already cached saves 5–10 seconds when they click Execute.
  useEffect(() => {
    prefetchCircuits();
  }, []);

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
        ? ((await singleRes.json()) as DraftSummary[])
            // Operator only handles private (Cloak-shielded) sends. Public
            // drafts are plain Squads transfers — no operator delivery step.
            .filter((d) => d.kind !== "public")
            .map((d) => ({
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
    setDraftLoading(true);

    try {
      // Try single draft first (fall back to non-sensitive view if wallet is not the operator)
      const singleResponse = await fetchDraftWithFallback(
        `/api/proposals/${encodeURIComponent(multisig)}/${encodeURIComponent(txIndex)}`,
      );
      if (singleResponse.ok) {
        const draft = (await singleResponse.json()) as SingleDraft;
        setLoadedDraft(draft);
        setDraftLoading(false);
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
        setDraftLoading(false);
        setExecutionSteps(draft.recipients.map((_, i) => ({ index: i, status: "pending" })));
        void checkOnChainStatus(txIndex, draft);
        return;
      }

      setError(
        `No persisted draft found for proposal #${txIndex}. Create it from the Send or Payroll page first.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load proposal draft.");
    } finally {
      setDraftLoading(false);
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

    // Detect invoice mode early — invoice flows only deposit into Cloak; the
    // recipient does their own fullWithdraw at claim time. The Ed25519 guard
    // below is only relevant for direct send paths where the operator
    // executes fullWithdraw to draft.recipient.
    const isInvoiceMode = !!(invoiceId ?? draft.commitmentClaim?.invoiceId);

    // Hard guard: Cloak relay can only deliver to Ed25519 wallets. Vault PDAs
    // (and other off-curve addresses) get accepted by the proposal flow but
    // rejected by the relay AFTER deposit, leaving SOL stuck in the shielded
    // pool. Reject here BEFORE any deposit happens, so retries don't accumulate
    // stuck deposits in the pool. Skipped for invoice mode — `draft.recipient`
    // there is informational (bound = recipient wallet; bearer = Curve25519
    // stealth pubkey), not the fullWithdraw destination.
    if (!isInvoiceMode && draft.recipient) {
      try {
        const recipientPk = new PublicKey(draft.recipient);
        if (!PublicKey.isOnCurve(recipientPk.toBuffer())) {
          const msg =
            `Cannot execute private send: recipient ${draft.recipient.slice(0, 4)}…${draft.recipient.slice(-4)} ` +
            `is not an Ed25519 wallet (likely a vault PDA). Cloak's shielded pool can only deliver to standard ` +
            `wallets. This proposal cannot be executed privately, so refund it (Refund button) and recreate as a ` +
            `Public send for vault-to-vault transfers.`;
          if (!suppressProgress) {
            startTransaction({
              title: "Cannot execute private send",
              description: msg,
              steps: [{ id: "block", title: "Validation", description: msg }],
            });
            failTransaction(msg);
          }
          throw new Error(msg);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Cannot execute private send")) throw err;
        // PublicKey constructor failure — propagate via a clearer message.
        throw new Error(`Invalid recipient address in proposal: ${draft.recipient}`);
      }
    }

    const transferLabel = draft.recipient
      ? ` to ${draft.recipient.slice(0, 4)}...${draft.recipient.slice(-4)}`
      : invoiceId
        ? " for invoice claim"
        : "";
    if (!suppressProgress)
      startTransaction({
        title: isPayroll ? "Executing payroll transfer" : "Executing private transfer",
        description: `${formatRawAmount(draft.invariants.amount, draft.invariants.tokenMint)}${transferLabel}. This may take longer while the privacy shield is prepared.`,
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
              onProgress: (message) =>
                updateTransaction({
                  detail: translateCloakProgress(message),
                }),
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

        // Persist the deposit immediately, before any later step can fail.
        // The whole point of this cache is to prevent a second on-chain deposit
        // when the user retries — so it has to land the moment the deposit is
        // confirmed, not after later steps. Carries withdrawn: false so the
        // recipient branch below knows withdraw still needs to run on retry.
        if (!cachedDeposit) {
          writeCloakDepositCache(multisigAddress.toBase58(), depositCacheKey, {
            ...cloakResult,
            withdrawn: false,
          });
        }

        // F4 invoice mode: use explicit invoiceId param or fall back to legacy commitmentClaim lookup
        const effectiveInvoiceId = invoiceId ?? draft.commitmentClaim?.invoiceId;

        if (effectiveInvoiceId) {
          updateStep("deliver", { status: "running" });
          // F4: store UTXO data for recipient claim.
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
          updateStep("deliver", {
            status: "success",
            description: "Invoice claim data saved.",
          });
        } else if (draft.recipient) {
          updateStep("deliver", { status: "running" });
          // F1: withdraw directly to recipient, no claim needed.
          if (cachedDeposit?.withdrawn) {
            // Deposit + withdraw already completed in a prior attempt — skip
            // fullWithdraw and proceed straight to execute_with_license below.
            updateStep("deliver", {
              status: "success",
              description: "Delivery already completed in a previous attempt.",
            });
            if (cachedDeposit.withdrawSignature) {
              setWithdrawSignature(cachedDeposit.withdrawSignature);
            }
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
                updateTransaction({
                  detail: translateCloakProgress(s),
                });
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
            // Mark the cache entry as withdrawn so a later license-step
            // failure doesn't trigger a duplicate withdraw on retry.
            writeCloakDepositCache(multisigAddress.toBase58(), depositCacheKey, {
              ...cloakResult,
              withdrawn: true,
              withdrawSignature: withdrawResult.signature,
            });
          }
        } else {
          updateStep("deliver", { status: "success", description: "Cloak deposit cached." });
        }
      } catch (caught) {
        const msg = caught instanceof Error ? caught.message : String(caught);
        if (msg.includes("stale") && _attempt < 2) {
          updateTransaction({ detail: "Note index stale, refreshing and retrying..." });
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 2000);
          });
          return executeSingle(draft, doCloakDeposit, depositCacheKey, invoiceId, _attempt + 1);
        }
        // Translate cryptic SDK PDA errors into actionable messages.
        const humanMsg = msg.includes("Merkle tree account not found")
          ? "Cloak shield pool not initialized for this token on the current network. " +
            "Only SOL private sends are supported on devnet. " +
            "The proposal must be refunded, use the Refund button below."
          : `Cloak deposit failed: ${msg}`;
        failTransaction(humanMsg);
        throw new Error(humanMsg);
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

    const {
      budgetIxs,
      simulationErr,
      logs: simLogs,
    } = await simulateAndOptimize({
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
          tokenMint: loadedDraft.invariants.tokenMint,
          status: "success",
          ...(sig ? { signature: sig } : {}),
          ...(cloakSignature ? { cloakSignature } : {}),
          ...(withdrawSignature ? { withdrawSignature } : {}),
        });
        markProposalExecuted(multisig, txIndex);
        void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
        void fetchPendingDrafts();
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

  async function refundToVault() {
    if (!loadedDraft || !wallet.publicKey || !multisigAddress || !wallet.sendTransaction) return;
    if (licenseStatus === "consumed") {
      setRefundError(
        "This proposal has already been delivered (license consumed). No refund is needed.",
      );
      return;
    }
    if (licenseStatus !== "active" && licenseStatus !== "expired") {
      setRefundError(
        "Vault funds have not reached the operator yet. Refund is only available after the multisig executes the proposal.",
      );
      return;
    }
    setRefunding(true);
    setRefundError(null);
    try {
      const mint = new PublicKey(loadedDraft.invariants.tokenMint);
      const amount = BigInt(loadedDraft.amount);
      const [vaultPda] = squadsMultisig.getVaultPda({
        multisigPda: multisigAddress,
        index: 0,
      });

      const tx = new Transaction();
      const isNativeSol = mint.equals(NATIVE_SOL_MINT);
      if (isNativeSol) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: vaultPda,
            lamports: amount,
          }),
        );
      } else {
        const operatorAta = await getAssociatedTokenAddress(mint, wallet.publicKey);
        const vaultAta = await getAssociatedTokenAddress(mint, vaultPda, true);
        const vaultAtaInfo = await connection.getAccountInfo(vaultAta);
        if (!vaultAtaInfo) {
          tx.add(
            createAssociatedTokenAccountInstruction(wallet.publicKey, vaultAta, vaultPda, mint),
          );
        }
        const mintInfo = await getMint(connection, mint);
        tx.add(
          createTransferCheckedInstruction(
            operatorAta,
            mint,
            vaultAta,
            wallet.publicKey,
            amount,
            mintInfo.decimals,
          ),
        );
      }
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const sig = await wallet.sendTransaction(tx, connection);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      setRefundSignature(sig);
      markProposalExecuted(multisig, txIndex);
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      void fetchPendingDrafts();
      setRefundConfirmOpen(false);
      setLoadedDraft(null);
      setPayrollDraft(null);
      setTxIndex("");
      setError(null);
      setSignature(null);
      setCloakSignature(null);
      setWithdrawSignature(null);
      setExecutionSteps([]);
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Refund failed.");
    } finally {
      setRefunding(false);
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
      steps: [
        {
          id: "batch",
          title: "Batch execution in progress",
          description: "Each recipient is processed sequentially.",
          status: "running",
        },
      ],
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
        title: `Payroll complete, ${completed} transfer${completed !== 1 ? "s" : ""} confirmed`,
        description: "All private payroll transfers have been executed on-chain.",
      });
      setPayrollComplete(true);
      if (lastSig) setSignature(lastSig);
      markProposalExecuted(multisig, txIndex);
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      void fetchPendingDrafts();
    } else {
      failTransaction(
        lastError ?? `Executed ${completed}/${payrollDraft.recipientCount} recipients.`,
      );
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
    const alreadyDone = executionSteps.filter(
      (s) => s.index < startIndex && s.status === "success",
    ).length;
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
        title: `Payroll complete, ${completed} transfer${completed !== 1 ? "s" : ""} confirmed`,
        description: "All private payroll transfers have been executed on-chain.",
      });
      setPayrollComplete(true);
      if (lastSig) setSignature(lastSig);
      markProposalExecuted(multisig, txIndex);
      void queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) });
      void fetchPendingDrafts();
    }
  }

  const successCount = executionSteps.filter((s) => s.status === "success").length;
  const isPayroll = payrollDraft !== null;
  const lowOperatorSol = operatorBalanceLamports !== null && operatorBalanceLamports < 10_000_000;

  // Budget: only SOL-denominated drafts count against operator's SOL balance.
  // USDC drafts are pre-funded into the operator's token account by the vault proposal.
  const totalNeededLamports = queueDrafts.reduce((sum, draft) => {
    const tokenMint = draft.invariants?.tokenMint ?? SOL_MINT;
    if (tokenMint !== SOL_MINT) return sum;
    const amt = BigInt(
      draft.type === "payroll" ? (draft.totalAmount ?? "0") : (draft.amount ?? "0"),
    );
    return sum + amt;
  }, 0n);
  const operatorBalBigInt = BigInt(operatorBalanceLamports ?? 0);
  const deficitLamports =
    totalNeededLamports > operatorBalBigInt ? totalNeededLamports - operatorBalBigInt : 0n;
  const hasDeficit = deficitLamports > 0n;

  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
          <div className="flex h-16 w-16 items-center justify-center rounded-panel border border-signal-danger/20 bg-signal-danger/5">
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
              The execution queue requires the registered operator wallet. Connect the correct
              wallet to continue.
            </p>
          </div>

          {/* Wallet comparison */}
          <div className="mt-10 w-full max-w-md space-y-2">
            {/* Connected (wrong) */}
            <div className="flex items-start gap-3 rounded-list border border-signal-danger/30 bg-signal-danger/5 px-4 py-3.5">
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
              <div className="flex items-start gap-3 rounded-list border border-border bg-surface px-4 py-3.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
                  <span className="text-[10px] font-bold leading-none text-accent">✓</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-eyebrow">
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
              className="text-sm font-medium text-ink-muted transition-aegis hover:text-ink"
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
      <div className="space-y-6">
        {/* ── Hero · Identity-locked operator card ──
            Single-keyholder surfaces lead with "who you are right now"
            (Fireblocks / Coinbase Custody pattern). Æ watermark + Fraunces
            title position the page as a private-bank signing console. */}
        <section className="card-hero relative">
          <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-center md:gap-6 md:p-7">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-accent-soft text-accent shadow-raise-1">
              <Key className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-eyebrow">
                Operator · Designated Signer
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                {operatorMismatch
                  ? "View-only · not the registered operator"
                  : "You hold the vault key"}
              </h1>
              <p className="mt-1.5 font-mono text-xs tabular-nums text-ink-muted">
                {registeredOperator ? truncateAddress(registeredOperator) : "No operator registered"}
              </p>
            </div>
            <div className="flex items-center gap-1 self-start md:self-auto">
              {executionHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="text-eyebrow inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-aegis hover:bg-surface-2 hover:text-ink"
                  aria-label="Open recent"
                >
                  <History className="h-3 w-3" aria-hidden="true" />
                  Recent · {executionHistory.length}
                </button>
              )}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="text-eyebrow inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-aegis hover:bg-surface-2 hover:text-ink"
              aria-label="How operator budget works"
            >
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              How this works
            </button>
            </div>
          </div>
        </section>

        {/* ── KPI strip · 3 numbers ──
            Awaiting · Value parked · Operator balance. Wormhole/Fireblocks
            relayer dashboards lead with queue-depth + value-at-risk. */}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card-panel relative p-5">
            <div className="flex items-center gap-1.5 text-eyebrow">
              <Inbox className="h-3 w-3" aria-hidden="true" />
              Awaiting my key
            </div>
            <p className="mt-2.5 font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
              {queueDrafts.length}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {queueDrafts.length === 0
                ? "Queue is calm."
                : queueDrafts.length === 1
                  ? "1 license to release."
                  : `${queueDrafts.length} licenses to release.`}
            </p>
          </div>

          <div
            className={cn(
              "card-panel relative p-5",
              hasDeficit && "border-signal-danger/30",
            )}
          >
            <div className="flex items-center gap-1.5 text-eyebrow">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Value to release
            </div>
            <p className="mt-2.5 font-display text-3xl font-semibold tabular-nums tracking-tight text-ink">
              {totalNeededLamports > 0n ? lamportsToSol(totalNeededLamports) : "0"}
              <span className="ml-1.5 text-sm font-medium text-ink-subtle">SOL</span>
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {hasDeficit
                ? `Operator short ${lamportsToSol(deficitLamports)} SOL`
                : "Funded by vault on proposal creation."}
            </p>
          </div>

          <div className="card-panel relative p-5">
            <div className="flex items-center gap-1.5 text-eyebrow">
              <Key className="h-3 w-3" aria-hidden="true" />
              Operator balance
            </div>
            <p
              className={cn(
                "mt-2.5 font-display text-3xl font-semibold tabular-nums tracking-tight",
                hasDeficit ? "text-signal-danger" : "text-ink",
              )}
            >
              {operatorBalanceLoading
                ? "…"
                : operatorBalanceLamports === null
                  ? "—"
                  : lamportsToSol(operatorBalanceLamports)}
              {operatorBalanceLamports !== null && !operatorBalanceLoading && (
                <span className="ml-1.5 text-sm font-medium text-ink-subtle">SOL</span>
              )}
            </p>
            <p
              className={cn(
                "mt-1 text-xs",
                cofreMissing
                  ? "text-signal-warn"
                  : lowOperatorSol
                    ? "text-signal-warn"
                    : "text-ink-muted",
              )}
            >
              {cofreMissing
                ? "Vault privacy not initialized."
                : lowOperatorSol
                  ? "Add SOL for network fees."
                  : "Funded for network fees."}
            </p>
          </div>
        </div>

        {/* Consolidated alert callout — only when the connected wallet is
            the wrong one, since the wrong-wallet guard above usually
            covers this; this surfaces the tail-case where membership
            check passed but operator role didn't. */}
        {operatorMismatch && wallet.publicKey ? (
          <InlineAlert tone="warning">
            <div className="space-y-1">
              <div className="font-medium">
                The connected wallet is not the registered operator. Switch wallets before
                executing.
              </div>
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

        {/* ── Master / detail · Inbox left, detail right (lg+) ──
            Single-keyholder triage pattern: list reads like a high-stakes
            inbox, not a database table. Detail panel sticks on scroll so
            the operator can review long memos without losing context.
            On mobile the inbox hides while a draft is loaded so the
            review surface owns the screen. */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* INBOX column */}
          <div className="lg:col-span-5 lg:flex">
            {queueDrafts.length === 0 ? (
              /* Calm empty state — flex h-full to match the detail column's
                  placeholder card height on lg+; min-h on mobile keeps the
                  card from collapsing when there's no parent height */
              <div className="card-panel flex min-h-[16rem] w-full flex-col items-center justify-center px-6 py-12 text-center lg:h-full lg:min-h-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-ink-subtle">
                  <Inbox className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-4 text-eyebrow">All clear</p>
                <h3 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
                  Vault is calm
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
                  {executionHistory.length > 0
                    ? `${executionHistory.length} licenses sealed in recent history.`
                    : "When the vault approves a private proposal, it shows up here for your key."}
                </p>
              </div>
            ) : (
              <div className="card-panel w-full overflow-hidden">
                {/* Header — visually parallels the active-draft header on
                    the right column */}
                <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
                  <div>
                    <p className="text-eyebrow">Inbox · awaiting key</p>
                    <h2 className="mt-0.5 font-display text-lg font-semibold tracking-tight text-ink">
                      {queueDrafts.length}{" "}
                      {queueDrafts.length === 1 ? "license" : "licenses"} to release
                    </h2>
                  </div>
                </div>
                <ul className="divide-y divide-border/50">
                  {queueDrafts.map((d) => {
                  const isLoaded = Boolean(loadedDraft || payrollDraft);
                  const isSelected = isLoaded && txIndex === d.transactionIndex;
                  const isPayrollDraft = d.type === "payroll";
                  const proposalStatus =
                    (d as unknown as { proposalStatus?: string }).proposalStatus ?? "unknown";
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => {
                          // Skip the round-trip if we're already on this draft.
                          if (txIndex === d.transactionIndex && (loadedDraft || payrollDraft)) {
                            return;
                          }
                          setTxIndex(d.transactionIndex);
                          setError(null);
                          setSignature(null);
                          setExecutionSteps([]);
                          // Surface the skeleton immediately so the operator
                          // sees a deliberate "loading" state rather than the
                          // previous draft's stale data while we fetch.
                          setLoadedDraft(null);
                          setPayrollDraft(null);
                          setDraftLoading(true);
                          void (async () => {
                            try {
                              const singleResponse = await fetchDraftWithFallback(
                                `/api/proposals/${encodeURIComponent(multisig)}/${encodeURIComponent(d.transactionIndex)}`,
                              );
                              if (singleResponse.ok) {
                                const draft = (await singleResponse.json()) as SingleDraft;
                                setPayrollDraft(null);
                                setLoadedDraft(draft);
                                void checkOnChainStatus(d.transactionIndex, draft);
                                return;
                              }
                              const payrollResponse = await fetchDraftWithFallback(
                                `/api/payrolls/${encodeURIComponent(multisig)}/${encodeURIComponent(d.transactionIndex)}`,
                              );
                              if (payrollResponse.ok) {
                                const draft = (await payrollResponse.json()) as PayrollDraft;
                                setLoadedDraft(null);
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
                            } finally {
                              setDraftLoading(false);
                            }
                          })();
                        }}
                        className={cn(
                          "group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-aegis",
                          isSelected
                            ? "bg-accent-soft/40 ring-1 ring-inset ring-accent/30"
                            : "hover:bg-surface-2",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-aegis",
                            isSelected
                              ? "bg-accent text-accent-ink shadow-raise-1"
                              : "bg-surface-2 text-ink-subtle group-hover:text-ink",
                          )}
                        >
                          {isPayrollDraft ? (
                            <Users className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Send className="h-4 w-4" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate font-display text-base font-semibold tabular-nums tracking-tight text-ink">
                              {formatRawAmount(
                                isPayrollDraft ? (d.totalAmount ?? d.amount) : d.amount,
                                d.invariants?.tokenMint ?? SOL_MINT,
                              )}
                            </p>
                            <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-subtle">
                              #{d.transactionIndex}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate font-mono text-xs text-ink-muted">
                            {isPayrollDraft
                              ? `${d.recipientCount ?? 0} recipients`
                              : d.recipient
                                ? truncateAddress(d.recipient)
                                : "Transfer"}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                statusDot(proposalStatus),
                              )}
                            />
                            <span className="text-[10px] uppercase tracking-eyebrow text-ink-subtle">
                              {statusLabel(proposalStatus)}
                            </span>
                            {isPayrollDraft && (
                              <span className="rounded-[3px] bg-accent-soft px-1 py-0.5 text-[9px] font-semibold uppercase tracking-eyebrow text-accent">
                                Payroll
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 shrink-0 transition-aegis",
                            isSelected
                              ? "text-accent"
                              : "text-ink-subtle group-hover:translate-x-0.5 group-hover:text-ink",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* DETAIL column */}
          <div className="lg:col-span-7 lg:flex">
            {/* Sticky on lg+ so the operator can scroll long memos / payroll
                tables while the inbox stays in place. */}
            <div className="w-full lg:sticky lg:top-6">
              {draftLoading ? (
                /* Skeleton — mirrors the active-draft layout so swapping
                    in real data feels seamless. shimmer-bg from globals.css
                    drives the subtle animated wash. */
                <div className="card-panel overflow-hidden">
                  <div className="border-b border-border/60 px-6 py-4">
                    <div className="h-3 w-40 shimmer-bg rounded" />
                    <div className="mt-2 h-5 w-56 shimmer-bg rounded" />
                  </div>
                  <div className="space-y-5 p-6">
                    <div>
                      <div className="h-3 w-32 shimmer-bg rounded" />
                      <div className="mt-2 h-10 w-48 shimmer-bg rounded" />
                    </div>
                    <div className="rounded-list border border-border/60 bg-bg/40 p-4 space-y-2">
                      <div className="h-3.5 w-full shimmer-bg rounded" />
                      <div className="h-3.5 w-3/4 shimmer-bg rounded" />
                      <div className="h-3.5 w-2/3 shimmer-bg rounded" />
                    </div>
                    <div className="rounded-list border border-border/60 bg-bg/40 p-4">
                      <div className="h-3 w-36 shimmer-bg rounded" />
                      <div className="mt-3 space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                          <div key={i} className="flex items-center gap-2.5">
                            <div className="h-4 w-4 shrink-0 rounded-full shimmer-bg" />
                            <div className="h-3.5 flex-1 shimmer-bg rounded" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="h-11 w-full shimmer-bg rounded-md" />
                  </div>
                </div>
              ) : !loadedDraft && !payrollDraft ? (
                <div className="card-panel hidden h-full flex-col items-center justify-center px-6 py-12 text-center lg:flex">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2 text-ink-subtle">
                    <Inbox className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-eyebrow">No license selected</p>
                  <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-ink">
                    Pick a license to review
                  </h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
                    Select an item from the inbox to see the full intent and pre-sign verification
                    before you release.
                  </p>
                </div>
              ) : (
                <div className="card-panel relative overflow-hidden">
                  {/* Active-draft header — visually mirrors the inbox
                      header on the left column for alignment */}
                  <div className="border-b border-border/60 px-6 py-4">
                    <p className="text-eyebrow">
                      Proposal #{txIndex} · {isPayroll ? "Payroll" : "Single transfer"}
                    </p>
                    <h2 className="mt-0.5 truncate font-display text-lg font-semibold tracking-tight text-ink">
                      {isPayroll
                        ? `${payrollDraft?.recipientCount} recipients`
                        : "Review · sign · release"}
                    </h2>
                  </div>

                  <div className="space-y-5 p-6">
                    {/* HERO AMOUNT — single transfer */}
                    {loadedDraft && !isPayroll && (
                      <div>
                        <p className="text-eyebrow">Amount to release</p>
                        <p className="mt-1 font-display text-4xl font-semibold tabular-nums tracking-tight text-ink md:text-5xl">
                          {formatRawAmount(
                            loadedDraft.amount,
                            loadedDraft.invariants.tokenMint,
                          )}
                        </p>
                      </div>
                    )}

                    {/* RECEIPT — single transfer */}
                    {loadedDraft && !isPayroll && (
                      <div className="rounded-list border border-border/60 bg-bg/40 px-4 py-3">
                        <ReceiptRow label="To">
                          {truncateAddress(loadedDraft.recipient)}
                        </ReceiptRow>
                        {decryptedMemo && (
                          <ReceiptRow label="Memo" mono={false}>
                            {decryptedMemo}
                          </ReceiptRow>
                        )}
                        {loadedDraft.memoCiphertext && !decryptedMemo && (
                          <ReceiptRow label="Memo" mono={false} tone="muted">
                            [encrypted memo]
                          </ReceiptRow>
                        )}
                        <ReceiptRow label="Status" mono={false} tone="muted">
                          {proposalStatusMessage ?? "Ready to execute"}
                        </ReceiptRow>
                      </div>
                    )}

                    {/* PRE-SIGN SAFETY STRIP — verifies the operator can
                        actually release before the wallet prompt fires.
                        Squads / ChainSecurity recommend a pre-execute
                        verification surface — this is ours. */}
                    {loadedDraft && !isPayroll && (
                      <div className="rounded-list border border-border/60 bg-bg/40 px-4 py-3">
                        <p className="text-eyebrow mb-2.5">Pre-sign verification</p>
                        <ul className="space-y-1.5">
                          {[
                            { label: "Vault privacy initialized", passed: !cofreMissing },
                            { label: "Operator funded for fees", passed: !lowOperatorSol },
                            {
                              label: "Connected wallet matches operator",
                              passed: !operatorMismatch,
                            },
                            { label: "License ready to execute", passed: canExecute },
                          ].map((check) => (
                            <li
                              key={check.label}
                              className="flex items-center gap-2.5 text-sm"
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                                  check.passed
                                    ? "bg-accent text-accent-ink"
                                    : "bg-surface-2 text-ink-subtle",
                                )}
                              >
                                {check.passed ? (
                                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                                ) : (
                                  <XIcon className="h-2.5 w-2.5" strokeWidth={3} />
                                )}
                              </span>
                              <span
                                className={cn(
                                  check.passed ? "text-ink" : "text-ink-muted",
                                )}
                              >
                                {check.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
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
                                  {formatRawAmount(r.amount, r.invariants?.tokenMint ?? SOL_MINT)}
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

                {/* Execute form — hidden after successful single or payroll execution.
                    Sign & Release is the brand-forward primary CTA: gold
                    gradient + accent-glow on hover, Lock icon to reinforce
                    that this is the shielded delivery step. */}
                {!signature && !payrollComplete && (
                  <form onSubmit={execute} className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="submit"
                        disabled={!canExecute}
                        className={cn(
                          "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition-aegis",
                          "bg-gradient-to-r from-accent to-accent-hover text-accent-ink shadow-raise-1 hover:shadow-accent-glow",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                      >
                        <ShieldCheck className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                        {pending
                          ? isPayroll
                            ? "Executing batch…"
                            : "Sealing license…"
                          : isPayroll
                            ? `Sign & release batch · ${payrollDraft?.recipientCount ?? 0}`
                            : "Sign & release"}
                      </button>
                      {loadedDraft &&
                        !isPayroll &&
                        (licenseStatus === "active" || licenseStatus === "expired") && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setRefundError(null);
                              setRefundConfirmOpen(true);
                            }}
                            disabled={pending || refunding || !wallet.publicKey}
                            title="Return vault-funded amount from operator back to the vault. Use only when the Cloak delivery cannot complete."
                          >
                            {refunding ? "Refunding…" : "Refund to vault"}
                          </Button>
                        )}
                    </div>
                    {refundError ? (
                      <p className="text-xs text-signal-danger">{refundError}</p>
                    ) : null}
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
                      Payroll complete,{" "}
                      {executionSteps.filter((s) => s.status === "success").length}/
                      {executionSteps.length} transfers confirmed
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
                                className="rounded-md px-2 py-1 text-xs font-semibold text-accent transition-aegis hover:bg-accent-soft"
                              >
                                Explorer
                              </a>
                            </dd>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Latest confirmed transactions (single transfer) — calm
                    success ribbon. Each signature gets a receipt-style row
                    with eyebrow label, mono signature, and Explorer link. */}
                {!isPayroll && (cloakSignature || signature || withdrawSignature) && (
                  <div className="rounded-list border border-accent/25 bg-accent-soft/30 px-4 py-3.5">
                    <div className="mb-2.5 flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink">
                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                      </div>
                      <p className="text-eyebrow text-accent">Released · Confirmed on chain</p>
                    </div>
                    <div className="space-y-1.5">
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
                          className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <dt className="text-[11px] uppercase tracking-eyebrow text-ink-subtle">
                            {item.label}
                          </dt>
                          <dd className="flex items-center gap-2">
                            <code className="font-mono text-xs tabular-nums text-ink">
                              {truncateSignature(item.value)}
                            </code>
                            <a
                              href={transactionExplorerUrl(item.value)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md px-2 py-1 text-[11px] font-semibold text-accent transition-aegis hover:bg-surface-2"
                            >
                              Explorer
                            </a>
                          </dd>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Execution history — side sheet so the audit trail is one click
          away from anywhere on the page without growing the active flow. */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader className="px-0 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
                <History className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-eyebrow">Operator</p>
                <SheetTitle className="mt-0.5">Recent</SheetTitle>
              </div>
            </div>
            <SheetDescription className="mt-2">
              {executionHistory.length}{" "}
              {executionHistory.length === 1 ? "run" : "runs"} ·{" "}
              {executionHistory.filter((e) => e.status === "success").length} sealed ·
              browser-local audit trail.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pt-2">
            {executionHistory.length === 0 ? (
              <div className="card-panel p-8 text-center">
                <p className="text-eyebrow">Empty</p>
                <p className="mt-2 text-sm text-ink-muted">
                  Once you run a license here, it shows up in this drawer.
                </p>
              </div>
            ) : (
              <ul className="card-list overflow-hidden divide-y divide-border/50">
                {executionHistory.map((item) => (
                  <li
                    key={item.id}
                    className="px-4 py-3.5 transition-aegis hover:bg-surface-2/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs tabular-nums text-ink-subtle">
                        #{item.transactionIndex}
                      </span>
                      <StatusPill tone={item.status === "success" ? "success" : "danger"}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </StatusPill>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium text-ink">
                      {item.type === "payroll"
                        ? `${item.recipientCount ?? 0} recipients`
                        : item.recipient
                          ? truncateAddress(item.recipient)
                          : "Single transfer"}
                    </p>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <p className="font-mono text-sm tabular-nums text-ink">
                        {formatRawAmount(item.amount, item.tokenMint ?? SOL_MINT)}
                      </p>
                      {item.signature ? (
                        <a
                          href={transactionExplorerUrl(item.signature)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md px-2 py-1 text-[11px] font-semibold text-accent transition-aegis hover:bg-accent-soft"
                        >
                          Explorer
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-muted">
                      {new Date(item.createdAt).toLocaleString()}
                      {item.error ? ` · ${item.error}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Help modal */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>How operator budget works</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-4 text-sm text-ink-muted">
            <div className="space-y-2">
              <p className="font-semibold text-ink">Why does the operator need SOL?</p>
              <p>
                Private transfers use <span className="font-medium text-ink">Cloak</span>, a
                privacy-shielded pool. The Cloak protocol requires a wallet with a private key to
                sign deposits. Because the vault PDA has no private key, the{" "}
                <span className="font-medium text-ink">operator's wallet</span> deposits into Cloak
                on behalf of the vault. The Cloak shielded pool then breaks the on-chain link
                between the deposit and the eventual withdrawal.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-4 font-mono text-xs leading-relaxed">
              <p className="text-ink-subtle">Private payment flow:</p>
              <p className="mt-2 text-ink">Vault → Operator (auto-funded in proposal)</p>
              <p className="text-ink">Operator wallet → Cloak pool</p>
              <p className="text-ink-subtle">
                ↓ (privacy shield keeps amount and recipient hidden)
              </p>
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

      {/* Refund confirmation modal */}
      <Dialog
        open={refundConfirmOpen}
        onOpenChange={(v) => {
          if (!refunding) setRefundConfirmOpen(v);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Refund stuck transfer to vault?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-4 text-sm text-ink-muted">
            <p>
              The proposal&apos;s on-chain transfer already moved{" "}
              <span className="font-medium text-ink">
                {loadedDraft
                  ? formatRawAmount(loadedDraft.amount, loadedDraft.invariants.tokenMint)
                  : "-"}
              </span>{" "}
              from the vault to the operator wallet, but the Cloak shielded delivery cannot complete
              (e.g., no shielded pool initialized for this token). Refunding sends those funds back
              from the operator wallet to the vault and removes this proposal from your operator
              queue.
            </p>
            <p className="text-xs">
              This signs a single transfer with the connected wallet. The recipient will receive
              nothing, you can resubmit later via Public mode if needed.
            </p>
            {refundError ? (
              <p className="rounded-md bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
                {refundError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRefundConfirmOpen(false)}
                disabled={refunding}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void refundToVault()}
                disabled={refunding}
              >
                {refunding ? "Refunding…" : "Refund to vault"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {refundSignature && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-signal-positive/30 bg-surface px-4 py-3 shadow-raise-2">
          <p className="text-sm font-semibold text-ink">Refund confirmed</p>
          <p className="mt-1 text-xs text-ink-muted">
            Funds returned to the vault.{" "}
            <a
              href={transactionExplorerUrl(refundSignature)}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              View transaction
            </a>
          </p>
          <button
            type="button"
            onClick={() => setRefundSignature(null)}
            className="mt-2 text-xs text-ink-subtle hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}
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

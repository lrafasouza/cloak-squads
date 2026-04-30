"use client";

import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

export type TransactionStepStatus = "pending" | "running" | "success" | "error";

export type TransactionStep = {
  id: string;
  title: string;
  description?: string;
  status: TransactionStepStatus;
  signature?: string;
};

type TransactionStatus = "running" | "success" | "error";

type TransactionState = {
  open: boolean;
  title: string;
  description?: string;
  status: TransactionStatus;
  detail?: string;
  proofProgress?: number;
  steps: TransactionStep[];
};

type StartTransactionInput = {
  title: string;
  description?: string;
  steps: Array<Omit<TransactionStep, "status"> & { status?: TransactionStepStatus }>;
};

type TransactionProgressContextValue = {
  transaction: TransactionState | null;
  startTransaction: (input: StartTransactionInput) => void;
  updateTransaction: (patch: Partial<Omit<TransactionState, "steps" | "open">>) => void;
  updateStep: (stepId: string, patch: Partial<TransactionStep>) => void;
  completeTransaction: (patch?: { title?: string; description?: string; detail?: string }) => void;
  failTransaction: (detail: string, stepId?: string) => void;
  closeTransaction: () => void;
};

const TransactionProgressContext = createContext<TransactionProgressContextValue | undefined>(
  undefined,
);

function truncateSignature(signature: string) {
  if (signature.length <= 18) return signature;
  return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
}

function explorerUrl(signature: string) {
  const cluster = publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER;
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

function statusTone(status: TransactionStepStatus) {
  if (status === "success") return "border-accent/35 bg-accent-soft text-accent";
  if (status === "error") return "border-signal-danger/40 bg-signal-danger/10 text-signal-danger";
  if (status === "running") return "border-accent/45 bg-surface text-accent";
  return "border-border bg-surface-2 text-ink-subtle";
}

function StepIcon({ status }: { status: TransactionStepStatus }) {
  if (status === "success") return <Check className="h-4 w-4" aria-hidden="true" />;
  if (status === "error") return <XCircle className="h-4 w-4" aria-hidden="true" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />;
}

function SignatureLink({ signature }: { signature: string }) {
  const [copied, setCopied] = useState(false);

  function copySignature() {
    void navigator.clipboard.writeText(signature).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg px-2.5 py-2">
      <code className="font-mono text-xs text-ink-muted">{truncateSignature(signature)}</code>
      <button
        type="button"
        onClick={copySignature}
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Copy transaction signature"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        {copied ? "Copied" : "Copy"}
      </button>
      <a
        href={explorerUrl(signature)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
      >
        Explorer
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

function TransactionModal({
  transaction,
  onClose,
}: {
  transaction: TransactionState;
  onClose: () => void;
}) {
  const canClose = transaction.status !== "running";
  const completedSteps = transaction.steps.filter((step) => step.status === "success").length;
  const progress = transaction.steps.length
    ? Math.round((completedSteps / transaction.steps.length) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/80 px-4 py-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-progress-title"
        aria-describedby="transaction-progress-description"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-ink shadow-raise-2"
      >
        <div className="border-b border-border bg-bg/45 px-5 py-4 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                  transaction.status === "error"
                    ? "border-signal-danger/35 bg-signal-danger/10 text-signal-danger"
                    : "border-accent/30 bg-accent-soft text-accent",
                )}
              >
                {transaction.status === "error" ? (
                  <XCircle className="h-5 w-5" aria-hidden="true" />
                ) : transaction.status === "success" ? (
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <WalletCards className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-eyebrow">
                  {transaction.status === "running"
                    ? "Transaction in progress"
                    : transaction.status === "success"
                      ? "Transaction complete"
                      : "Transaction failed"}
                </p>
                <h2
                  id="transaction-progress-title"
                  className="mt-1 font-display text-xl font-semibold text-ink"
                >
                  {transaction.title}
                </h2>
                {transaction.description ? (
                  <p
                    id="transaction-progress-description"
                    className="mt-1.5 text-sm leading-6 text-ink-muted"
                  >
                    {transaction.description}
                  </p>
                ) : null}
              </div>
            </div>
            {canClose ? (
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>Progress</span>
              <span className="font-mono tabular-nums">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-5 md:px-6" data-lenis-prevent>
          {transaction.detail ? (
            <div
              className={cn(
                "mb-4 rounded-lg border px-3 py-2.5 text-sm",
                transaction.status === "error"
                  ? "border-signal-danger/35 bg-signal-danger/10 text-signal-danger"
                  : "border-border bg-bg text-ink-muted",
              )}
            >
              {transaction.detail}
            </div>
          ) : null}

          {typeof transaction.proofProgress === "number" && transaction.status === "running" ? (
            <div className="mb-4 rounded-lg border border-border bg-bg px-3 py-3">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Zero-knowledge proof</span>
                <span className="font-mono tabular-nums">{transaction.proofProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${transaction.proofProgress}%` }}
                />
              </div>
            </div>
          ) : null}

          <ol className="grid gap-3">
            {transaction.steps.map((step) => (
              <li key={step.id} className="rounded-lg border border-border bg-bg p-3">
                <div className="flex gap-3">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                      statusTone(step.status),
                    )}
                  >
                    <StepIcon status={step.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{step.title}</p>
                      <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] uppercase text-ink-subtle">
                        {step.status}
                      </span>
                    </div>
                    {step.description ? (
                      <p className="mt-1 text-sm leading-5 text-ink-muted">{step.description}</p>
                    ) : null}
                    {step.signature ? <SignatureLink signature={step.signature} /> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="border-t border-border bg-bg/35 px-5 py-4 md:px-6">
          <p className="text-xs leading-5 text-ink-subtle">
            Keep this tab open until the flow finishes. Wallet prompts may appear between steps.
          </p>
        </div>
      </div>
    </div>
  );
}

export function TransactionProgressProvider({ children }: { children: ReactNode }) {
  const [transaction, setTransaction] = useState<TransactionState | null>(null);

  const startTransaction = useCallback((input: StartTransactionInput) => {
    setTransaction({
      open: true,
      title: input.title,
      description: input.description ?? "",
      status: "running",
      steps: input.steps.map((step, index) => ({
        ...step,
        status: step.status ?? (index === 0 ? "running" : "pending"),
      })),
    });
  }, []);

  const updateTransaction = useCallback(
    (patch: Partial<Omit<TransactionState, "steps" | "open">>) => {
      setTransaction((current) => (current ? { ...current, ...patch } : current));
    },
    [],
  );

  const updateStep = useCallback((stepId: string, patch: Partial<TransactionStep>) => {
    setTransaction((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
          }
        : current,
    );
  }, []);

  const completeTransaction = useCallback(
    (patch?: { title?: string; description?: string; detail?: string }) => {
      setTransaction((current) =>
        current
          ? {
              ...current,
              ...patch,
              status: "success",
              steps: current.steps.map((step) =>
                step.status === "error" ? step : { ...step, status: "success" },
              ),
            }
          : current,
      );
    },
    [],
  );

  const failTransaction = useCallback((detail: string, stepId?: string) => {
    setTransaction((current) =>
      current
        ? {
            ...current,
            status: "error",
            detail,
            steps: current.steps.map((step) =>
              step.id === stepId || (!stepId && step.status === "running")
                ? { ...step, status: "error", description: detail }
                : step,
            ),
          }
        : current,
    );
  }, []);

  const closeTransaction = useCallback(() => {
    setTransaction(null);
  }, []);

  const value = useMemo(
    () => ({
      transaction,
      startTransaction,
      updateTransaction,
      updateStep,
      completeTransaction,
      failTransaction,
      closeTransaction,
    }),
    [
      transaction,
      startTransaction,
      updateTransaction,
      updateStep,
      completeTransaction,
      failTransaction,
      closeTransaction,
    ],
  );

  return (
    <TransactionProgressContext.Provider value={value}>
      {children}
      {transaction?.open ? (
        <TransactionModal transaction={transaction} onClose={closeTransaction} />
      ) : null}
    </TransactionProgressContext.Provider>
  );
}

export function useTransactionProgress() {
  const context = useContext(TransactionProgressContext);
  if (!context) {
    throw new Error("useTransactionProgress must be used within TransactionProgressProvider");
  }
  return context;
}

"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { Check, Copy, ExternalLink, Loader2, WalletCards, X, XCircle } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AutoCloseIndicator } from "./auto-close-indicator";

/**
 * Transaction Progress modal.
 *
 * The "we're about to sign value" surface — opens whenever a multi-step
 * flow needs the user's wallet (Send Private, Swap, Payroll, Recurring,
 * Operator Execute). Designed for private-banking trust: same modal for
 * running / success / error (no toast replacement, no full-screen route),
 * vertical step list with three explicit visual states, and the
 * transaction signature surfaced the instant a hash exists so power users
 * can monitor on the explorer mid-flight.
 *
 * Research notes that shaped this redesign:
 *   - Stripe / Phantom / Rainbow all keep success in-context (no toast
 *     blow-up). The modal becomes the receipt.
 *   - ethereum.org DEX UX: don't fake percentages on blockchain steps;
 *     completed/total step ratio is the only honest progress signal.
 *   - mychores secure-signing study: human-readable "what this does"
 *     line is the single biggest reduction in mis-signing losses.
 *   - Carbon Modal: dim + body-lock for irrevocable surfaces.
 *
 * The provider API is unchanged — every existing caller (SendModal,
 * SwapModal, ExecuteButton, etc.) keeps working without edits.
 */

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
  return `${signature.slice(0, 8)}…${signature.slice(-8)}`;
}

function explorerUrl(signature: string) {
  const cluster = publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER;
  const clusterParam = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

const STEP_STATUS_LABEL: Record<TransactionStepStatus, string> = {
  pending: "Waiting",
  running: "In progress",
  success: "Done",
  error: "Failed",
};

/**
 * Step indicator with three explicit visual states:
 *  - pending: hairline ring on surface-2 (the unbroken "future")
 *  - running: gold spinner with subtle pulse halo
 *  - success: filled gold disk with white check
 *  - error: filled signal-danger disk with X
 */
function StepIndicator({ status }: { status: TransactionStepStatus }) {
  if (status === "success") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-raise-1">
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal-danger/15 text-signal-danger ring-1 ring-signal-danger/40">
        <XCircle className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }
  if (status === "running") {
    return (
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-ping rounded-full bg-accent/30"
          style={{ animationDuration: "2.4s" }}
        />
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent ring-1 ring-accent/45">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-ink-subtle">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    </div>
  );
}

/**
 * Receipt-style signature display. Surfaces the hash + Explorer link the
 * instant the hash exists — power users can monitor in real time, regular
 * users get an audit-trail handle without waiting for confirmation.
 */
function SignatureLink({ signature }: { signature: string }) {
  const [copied, setCopied] = useState(false);

  function copySignature() {
    void navigator.clipboard.writeText(signature).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-list border border-border/70 bg-bg/60 px-2.5 py-2">
      <span className="text-[9px] font-semibold uppercase tracking-eyebrow text-ink-subtle">
        sig
      </span>
      <code className="font-mono text-xs tabular-nums text-ink-muted">
        {truncateSignature(signature)}
      </code>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={copySignature}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-ink-subtle transition-aegis hover:bg-surface-2 hover:text-ink"
          aria-label="Copy transaction signature"
        >
          {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={explorerUrl(signature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-accent transition-aegis hover:bg-accent-soft"
        >
          Explorer
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

const SUCCESS_AUTO_CLOSE_MS = 10000;
const ERROR_AUTO_CLOSE_MS = 30000;

/**
 * Status icon — heraldic gold disc when running/success, danger disc when
 * error. On success, a ribbon flash sweeps across the modal once for a
 * single understated celebration (no confetti — wrong vocabulary for a
 * private treasury).
 */
function StatusIcon({ status }: { status: TransactionStatus }) {
  if (status === "success") {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/35 bg-accent text-accent-ink shadow-accent-glow">
        <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-signal-danger/40 bg-signal-danger/12 text-signal-danger">
        <XCircle className="h-6 w-6" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
      <WalletCards className="h-6 w-6" aria-hidden="true" />
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const canClose = transaction.status !== "running";
  const autoCloseMs =
    transaction.status === "success" ? SUCCESS_AUTO_CLOSE_MS : ERROR_AUTO_CLOSE_MS;

  // Body scroll lock while running — prevents the user from accidentally
  // navigating away mid-signing. Carbon Modal: irrevocable surfaces lock.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // ESC closes only when the wallet flow has settled (success or error).
  useEffect(() => {
    if (!canClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  // Auto-dismiss only when settled. 10s on success (long enough to read
  // the hash), 30s on error (long enough to read the message and decide).
  useEffect(() => {
    if (!canClose) return;
    const timer = setTimeout(() => {
      onClose();
    }, autoCloseMs);
    return () => clearTimeout(timer);
  }, [canClose, onClose, autoCloseMs]);

  const completedSteps = transaction.steps.filter((step) => step.status === "success").length;
  const progress = transaction.steps.length
    ? Math.round((completedSteps / transaction.steps.length) * 100)
    : 0;

  // Heraldic gold sweep on success — single ribbon flash across the top
  // of the modal, replaces the conventional success-toast slide.
  const showRibbonFlash = transaction.status === "success";

  const eyebrowLabel =
    transaction.status === "running"
      ? "Processing · Heraldic Workstation"
      : transaction.status === "success"
        ? "Transaction sealed"
        : "Transaction failed";
  const eyebrowTone =
    transaction.status === "error"
      ? "text-signal-danger"
      : transaction.status === "success"
        ? "text-accent"
        : "text-ink-muted";

  const node = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6 backdrop-blur-md"
      style={{ background: "hsl(var(--bg) / 0.78)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-progress-title"
        aria-describedby="transaction-progress-description"
        className="relative w-full max-w-2xl overflow-hidden rounded-modal border border-border bg-surface text-ink shadow-raise-2"
        style={{
          boxShadow:
            "0 1px 0 0 hsl(var(--inset-highlight)) inset, 0 18px 56px -16px rgb(0 0 0 / 0.5)",
        }}
      >
        {/* Heraldic gold seal — preview of the Dialog primitive. On success
            the seal pulses gold for ~1.4s as the only celebration cue. */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent/0 via-accent to-accent/0",
            showRibbonFlash && "animate-pulse",
          )}
          style={showRibbonFlash ? { animationDuration: "1.4s" } : undefined}
        />

        {/* Æ watermark — quiet brand moment behind the content */}
        <HeraldicWatermark size={280} opacity={0.045} />

        {/* Header — value-first layout. Eyebrow says where we are in the
            lifecycle, title says what's happening, description says why. */}
        <div className="relative border-b border-border/60 px-6 pt-7 md:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <StatusIcon status={transaction.status} />
              <div className="min-w-0">
                <p className={cn("text-eyebrow", eyebrowTone)}>{eyebrowLabel}</p>
                <h2
                  id="transaction-progress-title"
                  className="mt-1 font-display text-xl font-semibold tracking-tight text-ink"
                >
                  {transaction.title}
                </h2>
                {transaction.description ? (
                  <p
                    id="transaction-progress-description"
                    className="mt-1.5 max-w-md text-sm leading-6 text-ink-muted"
                  >
                    {transaction.description}
                  </p>
                ) : null}
              </div>
            </div>
            {canClose ? (
              <div className="flex items-center gap-2">
                <AutoCloseIndicator
                  durationMs={autoCloseMs}
                  onComplete={onClose}
                  paused={!canClose}
                />
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>

          {/* Honest progress bar — bound to completed/total step ratio.
              ethereum.org: never fake a percentage on blockchain steps. */}
          <div className="mt-6 pb-5">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-eyebrow text-ink-subtle">
              <span>
                Step {Math.min(completedSteps + (transaction.status === "running" ? 1 : 0), transaction.steps.length)}{" "}
                of {transaction.steps.length}
              </span>
              <span className="font-mono normal-case tracking-normal tabular-nums text-ink-muted">
                {progress}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 ease-out",
                  transaction.status === "success"
                    ? "bg-accent"
                    : transaction.status === "error"
                      ? "bg-signal-danger"
                      : "bg-gradient-to-r from-accent to-accent-hover",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Body — vertical step list. Each step is a card-list row so the
            user can read titles, descriptions, and the live signature
            without scanning a long table. Detail callout (top-of-body)
            surfaces the failure/success message near the eye, not in a
            footer the user might miss. */}
        <div className="relative max-h-[58vh] overflow-y-auto px-6 py-5 md:px-8" data-lenis-prevent>
          {transaction.detail ? (
            <div
              className={cn(
                "mb-4 rounded-list border px-3.5 py-2.5 text-sm leading-6",
                transaction.status === "error"
                  ? "border-signal-danger/35 bg-signal-danger/10 text-signal-danger"
                  : transaction.status === "success"
                    ? "border-accent/30 bg-accent-soft text-ink"
                    : "border-border bg-bg/40 text-ink-muted",
              )}
            >
              {transaction.detail}
            </div>
          ) : null}

          <ol className="card-list divide-y divide-border/50 overflow-hidden">
            {transaction.steps.map((step, index) => {
              const isLast = index === transaction.steps.length - 1;
              return (
                <li
                  key={step.id}
                  className={cn(
                    "relative flex gap-3.5 px-4 py-3.5 transition-aegis",
                    step.status === "running" && "bg-accent-soft/30",
                  )}
                >
                  {/* Connector — vertical hairline that links steps so the
                      list reads as one continuous flow rather than four
                      independent rows. */}
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-[31px] top-[58px] h-[calc(100%-32px)] w-px",
                        step.status === "success" ? "bg-accent/40" : "bg-border",
                      )}
                    />
                  )}
                  <StepIndicator status={step.status} />
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          step.status === "error"
                            ? "text-signal-danger"
                            : step.status === "running"
                              ? "text-ink"
                              : step.status === "success"
                                ? "text-ink"
                                : "text-ink-muted",
                        )}
                      >
                        {step.title}
                      </p>
                      <span
                        className={cn(
                          "rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-eyebrow",
                          step.status === "running"
                            ? "border-accent/35 bg-accent-soft text-accent"
                            : step.status === "success"
                              ? "border-accent/35 bg-accent-soft/60 text-accent"
                              : step.status === "error"
                                ? "border-signal-danger/35 bg-signal-danger/10 text-signal-danger"
                                : "border-border bg-surface-2 text-ink-subtle",
                        )}
                      >
                        {STEP_STATUS_LABEL[step.status]}
                      </span>
                    </div>
                    {step.description ? (
                      <p
                        className={cn(
                          "mt-1 text-sm leading-5",
                          step.status === "error"
                            ? "text-signal-danger/85"
                            : "text-ink-muted",
                        )}
                      >
                        {step.description}
                      </p>
                    ) : null}
                    {step.signature ? <SignatureLink signature={step.signature} /> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Footer — shows the right hint for the current state. On success,
            offers a primary "Done" so users with an explicit action have
            one. On error, surfaces a "Close" but keeps the body visible
            so the user can copy the failing step's detail. */}
        <div className="relative flex items-center justify-between gap-3 border-t border-border/60 bg-bg/30 px-6 py-4 md:px-8">
          <p className="text-[11px] leading-relaxed text-ink-subtle">
            {transaction.status === "success"
              ? "All steps sealed. Receipt will auto-close shortly."
              : transaction.status === "error"
                ? "One step failed. Copy the detail above before closing."
                : "Keep this tab open. Your wallet may prompt between steps."}
          </p>
          {canClose && (
            <Button
              type="button"
              variant={transaction.status === "success" ? "default" : "secondary"}
              size="sm"
              onClick={onClose}
            >
              {transaction.status === "success" ? "Done" : "Close"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(node, document.body);
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
      {/* Same modal across running / success / error — never replace with
          a toast (Stripe / Phantom / Rainbow consensus). The modal IS the
          receipt. */}
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

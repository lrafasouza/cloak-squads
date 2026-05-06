"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "../ui/aegis";
import { ScrollReveal } from "./ScrollReveal";

/* ────────────────────────────────────────────────────────────────────────────
   Cast & helpers
   ──────────────────────────────────────────────────────────────────────── */

type Member = { name: string; role: string; gradient: string };

const TEAM: Member[] = [
  { name: "Alex", role: "Treasury lead", gradient: "from-amber-300 to-amber-700" },
  { name: "Ria", role: "Operations", gradient: "from-emerald-300 to-emerald-700" },
  { name: "Noor", role: "Founder", gradient: "from-sky-300 to-sky-700" },
  { name: "Kira", role: "Engineering", gradient: "from-rose-300 to-rose-700" },
];

const AUDITOR: Member = {
  name: "Marie",
  role: "Accountant · external",
  gradient: "from-violet-300 to-violet-700",
};

function Avatar({
  member,
  size = 36,
  ring = false,
  signed = false,
}: {
  member: Member;
  size?: number;
  ring?: boolean;
  signed?: boolean;
}) {
  const initial = member.name[0];
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-gradient-to-br font-display text-white font-semibold",
          member.gradient,
          ring && "ring-2 ring-bg",
        )}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.42,
        }}
        aria-hidden
      >
        <span className="opacity-90">{initial}</span>
      </div>
      {signed && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.25 }}
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-signal-positive ring-2 ring-bg"
        >
          <Check className="h-2.5 w-2.5 text-[#0d1208]" strokeWidth={3} />
        </motion.div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   ACT 1 — Compose
   ──────────────────────────────────────────────────────────────────────── */

function ActCompose() {
  return (
    <div className="flex flex-col h-full">
      {/* Window header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-bg/40">
        <div className="flex items-center gap-2.5">
          <Avatar member={TEAM[0]!} size={28} />
          <div>
            <p className="text-xs font-semibold text-ink leading-tight">{TEAM[0]!.name}</p>
            <p className="text-[10px] text-ink-subtle leading-tight">
              {TEAM[0]!.role}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="close"
          className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 px-5 py-5 space-y-3.5 overflow-hidden">
        <Eyebrow as="div">New payment</Eyebrow>

        {/* Recipient field */}
        <div>
          <label className="text-[11px] font-medium text-ink-subtle">To</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-border/60 bg-bg/60 px-3 py-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-purple-600 text-white text-[10px] font-semibold">
              A
            </div>
            <span className="text-sm text-ink">alice.sol</span>
            <span className="ml-auto text-[10px] text-signal-positive">
              <Check className="inline h-3 w-3" /> Verified
            </span>
          </div>
        </div>

        {/* Amount field */}
        <div>
          <label className="text-[11px] font-medium text-ink-subtle">Amount</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-border/60 bg-bg/60 px-3 py-2.5">
            <span className="text-ink-subtle">$</span>
            <span className="font-display text-lg font-semibold text-ink num">5,000</span>
            <span className="ml-auto text-xs font-medium text-ink-muted">USDC</span>
          </div>
        </div>

        {/* Memo */}
        <div>
          <label className="text-[11px] font-medium text-ink-subtle">Memo</label>
          <div className="mt-1 rounded-lg border border-border/60 bg-bg/60 px-3 py-2">
            <span className="text-sm text-ink">June payroll</span>
          </div>
        </div>

        {/* Privacy toggle */}
        <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/[0.04] px-3 py-2.5">
          <Lock className="h-4 w-4 text-accent shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink">Keep this payment private</p>
              <div className="relative h-5 w-9 shrink-0 rounded-full bg-accent">
                <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-white" />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle leading-tight">
              Only your team and approved auditors see the details.
            </p>
          </div>
        </div>
      </div>

      {/* Footer button */}
      <div className="border-t border-border/60 bg-bg/40 px-5 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink-subtle">
            Will need <strong className="text-ink">3 of 4</strong> approvals
          </span>
          <button
            type="button"
            className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-ink"
          >
            Send for approval
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   ACT 2 — Team approves
   ──────────────────────────────────────────────────────────────────────── */

function ActApprove() {
  const [signedCount, setSignedCount] = useState(1); // proposer pre-signed
  const [showApprovedToast, setShowApprovedToast] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setSignedCount(2), 700);
    const t2 = setTimeout(() => setSignedCount(3), 1900);
    const t3 = setTimeout(() => setShowApprovedToast(true), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-bg/40">
        <div>
          <Eyebrow as="div">Awaiting approval</Eyebrow>
          <p className="text-xs text-ink mt-0.5">Payment to alice.sol</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-eyebrow transition-colors",
            signedCount >= 3
              ? "border-signal-positive/30 bg-signal-positive/10 text-signal-positive"
              : "border-accent/30 bg-accent-soft text-accent",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              signedCount >= 3 ? "bg-signal-positive" : "bg-accent animate-pulse",
            )}
          />
          {signedCount}/3 needed
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 px-5 py-4 space-y-3 overflow-hidden">
        {/* Payment summary card */}
        <div className="rounded-lg border border-border/60 bg-bg/60 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
              amount
            </p>
            <p className="font-display text-lg font-semibold text-ink num leading-tight">
              $5,000 <span className="text-xs font-medium text-ink-muted">USDC</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
              memo
            </p>
            <p className="text-sm text-ink leading-tight mt-0.5">June payroll</p>
          </div>
        </div>

        {/* Approver list */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
            your team
          </p>
          {TEAM.map((m, i) => {
            const isSigned = i < signedCount;
            const isProposer = i === 0;
            const justSigned = isSigned && i === signedCount - 1 && signedCount > 1;
            return (
              <motion.div
                key={m.name}
                initial={false}
                animate={
                  justSigned
                    ? { backgroundColor: "hsl(var(--accent-soft))" }
                    : { backgroundColor: "hsl(var(--surface) / 0)" }
                }
                transition={{ duration: 0.6 }}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5"
              >
                <Avatar member={m} size={28} signed={isSigned} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink leading-tight">
                    {m.name}
                    {isProposer && (
                      <span className="ml-1.5 text-[9px] font-mono uppercase tracking-eyebrow text-ink-subtle">
                        proposer
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-ink-subtle leading-tight">{m.role}</p>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isSigned ? "text-signal-positive" : "text-ink-subtle",
                  )}
                >
                  {isSigned ? (isProposer ? "Created" : "Approved") : "Waiting…"}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Approved toast */}
      <AnimatePresence>
        {showApprovedToast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-signal-positive/30 bg-signal-positive/10 px-5 py-2.5 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 text-signal-positive" />
            <span className="text-xs font-medium text-signal-positive">
              Threshold met. Sending now.
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   ACT 3 — Sent privately
   ──────────────────────────────────────────────────────────────────────── */

function ActSent() {
  return (
    <div className="flex flex-col h-full">
      {/* Hero confirmation */}
      <div className="flex flex-col items-center text-center px-5 pt-8 pb-5">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-3"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-signal-positive/15 ring-4 ring-signal-positive/10">
            <CheckCircle2 className="h-7 w-7 text-signal-positive" />
          </div>
        </motion.div>
        <p className="font-display text-xl font-semibold text-ink">Sent privately</p>
        <p className="mt-1 text-xs text-ink-muted">
          $5,000 USDC reached alice.sol in 1.2 seconds
        </p>
      </div>

      {/* The two views */}
      <div className="px-5 pb-5 flex-1 grid grid-cols-2 gap-3">
        {/* Public ledger */}
        <div className="rounded-xl border border-border/60 bg-bg/60 p-3 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2.5">
            <EyeOff className="h-3.5 w-3.5 text-ink-subtle" />
            <span className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
              what the public sees
            </span>
          </div>
          <div className="space-y-2 text-[11px] flex-1">
            <div>
              <p className="text-ink-subtle">amount</p>
              <p className="text-ink-subtle">▒▒▒▒▒</p>
            </div>
            <div>
              <p className="text-ink-subtle">to</p>
              <p className="text-ink-subtle">▒▒▒…▒▒</p>
            </div>
            <div>
              <p className="text-ink-subtle">memo</p>
              <p className="text-ink-subtle">▒▒▒</p>
            </div>
          </div>
        </div>

        {/* Team view */}
        <div className="rounded-xl border border-accent/40 bg-accent/[0.05] p-3 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Eye className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] font-mono uppercase tracking-eyebrow text-accent">
              what your team sees
            </span>
          </div>
          <div className="space-y-2 text-[11px] flex-1">
            <div>
              <p className="text-ink-subtle">amount</p>
              <p className="text-ink num font-medium">$5,000 USDC</p>
            </div>
            <div>
              <p className="text-ink-subtle">to</p>
              <p className="text-ink">alice.sol</p>
            </div>
            <div>
              <p className="text-ink-subtle">memo</p>
              <p className="text-ink">June payroll</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer caption */}
      <div className="border-t border-border/60 bg-bg/40 px-5 py-2.5 text-center">
        <span className="text-[11px] text-ink-subtle">
          The chain proves it happened. It doesn&apos;t leak the details.
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   ACT 4 — Auditor gets a scoped link
   ──────────────────────────────────────────────────────────────────────── */

function ActAudit() {
  const auditScope = [
    { allowed: true, label: "June payroll" },
    { allowed: true, label: "Vendor invoices" },
    { allowed: false, label: "Token swaps" },
    { allowed: false, label: "Investor distributions" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-bg/40">
        <div>
          <Eyebrow as="div">Share with your accountant</Eyebrow>
          <p className="text-xs text-ink mt-0.5">Read-only · revoke anytime</p>
        </div>
        <Mail className="h-4 w-4 text-ink-subtle" />
      </div>

      {/* Body */}
      <div className="flex-1 px-5 py-4 space-y-4 overflow-hidden">
        {/* Recipient */}
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-bg/60 px-3.5 py-2.5">
          <Avatar member={AUDITOR} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink leading-tight">{AUDITOR.name}</p>
            <p className="text-[11px] text-ink-subtle truncate leading-tight">
              marie@cpa-firm.com · {AUDITOR.role.split(" · ")[0]}
            </p>
          </div>
          <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-ink-subtle">
            external
          </span>
        </div>

        {/* What Marie can see */}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle mb-2">
            what marie can see
          </p>
          <div className="space-y-1.5">
            {auditScope.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-1.5",
                  s.allowed
                    ? "bg-signal-positive/10 border border-signal-positive/20"
                    : "bg-surface/40 border border-border/40",
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    s.allowed ? "bg-signal-positive/30" : "bg-surface-3",
                  )}
                >
                  {s.allowed ? (
                    <Check className="h-2.5 w-2.5 text-signal-positive" strokeWidth={3} />
                  ) : (
                    <X className="h-2.5 w-2.5 text-ink-subtle" strokeWidth={3} />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs",
                    s.allowed ? "text-ink" : "text-ink-subtle line-through",
                  )}
                >
                  {s.label}
                </span>
                {s.allowed && i === 0 && (
                  <span className="ml-auto text-[10px] text-signal-positive font-medium">
                    just shipped
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border/60 bg-bg/40 px-5 py-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-subtle">
            <Clock className="h-3 w-3" />
            Expires in 30 days
          </span>
          <button
            type="button"
            className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-ink"
          >
            Send link
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   App frame
   ──────────────────────────────────────────────────────────────────────── */

const ACTS = [
  { id: "compose", title: "Alex starts a payment", caption: "Same form your finance team already knows.", Component: ActCompose },
  { id: "approve", title: "The team approves", caption: "Whatever your threshold is, 2-of-3 or 3-of-5, Aegis respects it.", Component: ActApprove },
  { id: "sent", title: "Sent privately", caption: "The chain proves it happened. The details stay with you.", Component: ActSent },
  { id: "audit", title: "Auditors get just what they need", caption: "Scoped, read-only, revocable. No spreadsheet exports.", Component: ActAudit },
] as const;

const ACT_DURATION = 6500;

function AppFrame({
  act,
}: {
  act: number;
}) {
  const Current = ACTS[act]!.Component;
  return (
    <div className="relative rounded-[28px] border border-border/80 bg-surface/40 backdrop-blur-sm p-2.5 shadow-raise-2 overflow-hidden">
      {/* Outer chrome dots */}
      <div className="flex items-center gap-1.5 px-3 pt-1 pb-2.5 min-w-0">
        <div className="flex gap-1 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="ml-3 flex items-center gap-1.5 rounded-md bg-bg/60 px-2.5 py-1 font-mono text-[10px] text-ink-subtle shrink min-w-0">
          <Wallet className="h-3 w-3 shrink-0" />
          <span className="truncate">aegis.com</span>
        </div>
        <span className="ml-auto hidden sm:inline-flex items-center gap-1 rounded-full border border-border/50 bg-bg/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-ink-subtle shrink-0">
          <Building2 className="h-2.5 w-2.5" />
          treasury · 4 members
        </span>
      </div>

      {/* Inner viewport */}
      <div className="relative rounded-2xl border border-border/60 bg-bg overflow-hidden h-[470px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={ACTS[act]!.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            <Current />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Section
   ──────────────────────────────────────────────────────────────────────── */

export function SeeItWork() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [act, setAct] = useState(0);
  const [active, setActive] = useState(false);

  // Activate auto-rotation only when section is visible
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry?.isIntersecting ?? false),
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setAct((a) => (a + 1) % ACTS.length), ACT_DURATION);
    return () => clearTimeout(t);
  }, [act, active]);

  return (
    <section
      id="see-it-work"
      ref={sectionRef}
      className="relative z-10 border-y border-border/60 bg-bg overflow-hidden"
    >
      {/* Backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 0%, hsl(var(--accent)) 0%, transparent 40%), radial-gradient(circle at 100% 100%, hsl(var(--accent)) 0%, transparent 50%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
        {/* Header */}
        <ScrollReveal>
          <div className="mb-12 md:mb-16 grid md:grid-cols-12 gap-6 items-end">
            <div className="md:col-span-7">
              <Eyebrow as="div" className="mb-3">See it work</Eyebrow>
              <h2 className="font-display text-display-sm font-bold text-ink leading-[1.05]">
                One payment.{" "}
                <span className="text-accent">Four people. Zero noise.</span>
              </h2>
            </div>
            <div className="md:col-span-5">
              <p className="text-ink-muted leading-relaxed">
                Watch a real treasury payment move through Aegis. Proposed,
                approved by the team, sent privately, then opened up to an
                auditor with scoped access. No code, no jargon.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Demo */}
        <div className="grid lg:grid-cols-12 gap-8 md:gap-12 items-start">
          {/* Side narration */}
          <div className="lg:col-span-5 lg:sticky lg:top-28 self-start">
            <ScrollReveal>
              <ol className="space-y-1">
                {ACTS.map((a, i) => {
                  const isActive = i === act;
                  const isPast = i < act;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setAct(i)}
                        className={cn(
                          "w-full text-left rounded-xl border px-4 py-4 transition-all duration-500",
                          isActive
                            ? "border-accent/40 bg-accent/[0.03]"
                            : "border-transparent bg-transparent hover:bg-surface/30",
                        )}
                      >
                        <div className="flex items-start gap-3.5">
                          <span
                            className={cn(
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] transition-all",
                              isActive
                                ? "bg-accent text-accent-ink"
                                : isPast
                                  ? "bg-accent-soft text-accent border border-accent/30"
                                  : "bg-surface text-ink-subtle border border-border",
                            )}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "font-display text-base font-semibold leading-tight transition-colors",
                                isActive ? "text-ink" : isPast ? "text-ink" : "text-ink-subtle",
                              )}
                            >
                              {a.title}
                            </p>
                            <p
                              className={cn(
                                "mt-1 text-xs leading-relaxed transition-colors",
                                isActive ? "text-ink-muted" : "text-ink-subtle/80",
                              )}
                            >
                              {a.caption}
                            </p>
                            {isActive && (
                              <motion.div
                                key={`bar-${act}`}
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ duration: ACT_DURATION / 1000, ease: "linear" }}
                                className="mt-2.5 h-0.5 bg-accent/70 rounded-full"
                              />
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </ScrollReveal>
          </div>

          {/* App frame */}
          <div className="lg:col-span-7">
            <ScrollReveal delay={0.05}>
              <AppFrame act={act} />
            </ScrollReveal>

            {/* Below frame: takeaways in human language */}
            <ScrollReveal delay={0.1}>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    Icon: Sparkles,
                    title: "Same vote, more privacy",
                    body: "Your existing multisig flow. Aegis just hides the parts that should never have been public.",
                  },
                  {
                    Icon: Lock,
                    title: "For your finance team",
                    body: "A clear app, in plain English. Built for finance teams first.",
                  },
                  {
                    Icon: Eye,
                    title: "Just for your auditors",
                    body: "Share scoped views with accountants. Read-only, time-bound, you revoke whenever.",
                  },
                ].map((t) => (
                  <div
                    key={t.title}
                    className="rounded-xl border border-border/60 bg-surface/30 p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft border border-accent/30">
                        <t.Icon className="h-3.5 w-3.5 text-accent" />
                      </div>
                      <p className="text-sm font-semibold text-ink">{t.title}</p>
                    </div>
                    <p className="text-xs text-ink-muted leading-relaxed">{t.body}</p>
                  </div>
                ))}
              </div>
            </ScrollReveal>

          </div>
        </div>
      </div>
    </section>
  );
}

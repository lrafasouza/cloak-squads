"use client";

import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Eyebrow } from "../ui/aegis";
import { ScrollReveal } from "./ScrollReveal";

/* ────────────────────────────────────────────────────────────────────────────
   Shared text column
   ──────────────────────────────────────────────────────────────────────── */

function CaseText({
  num,
  kicker,
  title,
  body,
  bullets,
  exclusive = false,
}: {
  num: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  exclusive?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Eyebrow as="div">
          <span className="text-accent">{num}</span>
          <span className="mx-2 text-ink-subtle/40">/</span>
          <span>{kicker}</span>
        </Eyebrow>
        {exclusive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-eyebrow text-accent">
            <Sparkles className="h-2.5 w-2.5" />
            Aegis exclusive
          </span>
        )}
      </div>
      <h3 className="font-display text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-ink leading-[1.05] tracking-tight">
        {title}
      </h3>
      <p className="mt-5 text-ink-muted leading-relaxed">{body}</p>
      <ul className="mt-6 space-y-3">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-3 text-sm text-ink-muted">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.7} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Shared visual frame — gives every mockup the same premium chrome
   ──────────────────────────────────────────────────────────────────────── */

function VisualFrame({
  children,
  caption,
  className,
}: {
  children: React.ReactNode;
  caption?: { left?: string; right?: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border/80 bg-surface/40 p-2 shadow-raise-2 overflow-hidden",
        className,
      )}
    >
      {/* Backdrop glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, hsl(var(--accent) / 0.08), transparent 50%)",
        }}
      />
      <div className="relative rounded-xl border border-border/60 bg-bg overflow-hidden">
        {children}
      </div>
      {caption && (
        <div className="relative mt-3 flex items-center justify-between px-3 pb-1 text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
          {caption.left && <span>{caption.left}</span>}
          {caption.right && <span className="ml-auto">{caption.right}</span>}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   CASE 01 — Payroll mockup
   ──────────────────────────────────────────────────────────────────────── */

const PAYROLL_ROWS: Array<{ name: string; role: string; amount: number }> = [
  { name: "alex.sol", role: "engineering", amount: 4_200 },
  { name: "ria.sol", role: "design", amount: 3_800 },
  { name: "noor.sol", role: "engineering", amount: 4_500 },
  { name: "kira.sol", role: "ops", amount: 3_600 },
  { name: "miko.sol", role: "engineering", amount: 4_400 },
  { name: "sven.sol", role: "research", amount: 5_100 },
];

function PayrollMockup() {
  const total = PAYROLL_ROWS.reduce((acc, r) => acc + r.amount, 0);
  const [signed, setSigned] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function loop() {
      if (cancelled) return;
      setSigned(0);
      [1, 2, 3, 4].forEach((s, i) => {
        setTimeout(() => !cancelled && setSigned(s), 700 + i * 700);
      });
      setTimeout(() => !cancelled && setSigned(0), 7500);
      setTimeout(loop, 9000);
    }
    const t = setTimeout(loop, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <VisualFrame caption={{ left: "Treasury vault · 4 signers", right: "June payroll" }}>
      <div className="px-5 md:px-6 py-5 md:py-6">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft border border-accent/30">
              <FileSpreadsheet className="h-5 w-5 text-accent" strokeWidth={1.6} />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-ink leading-tight">
                June payroll
              </p>
              <p className="text-[11px] text-ink-subtle leading-tight mt-0.5">
                Imported from <span className="text-ink-muted">team.csv</span>
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2 sm:px-2.5 py-1 font-mono text-[10px] uppercase tracking-eyebrow text-accent">
            <Lock className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">Will ship privately</span>
            <span className="sm:hidden">Private</span>
          </span>
        </div>

        {/* Spreadsheet */}
        <div className="rounded-xl border border-border/60 bg-bg/40 overflow-hidden font-mono text-[12px]">
          <div className="grid grid-cols-[auto,1fr,auto] sm:grid-cols-[auto,1fr,auto,auto] gap-3 px-3 sm:px-4 py-2 border-b border-border/60 bg-surface/40 text-ink-subtle uppercase tracking-eyebrow text-[10px]">
            <span>#</span>
            <span>Recipient</span>
            <span className="hidden sm:inline text-right">Role</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="divide-y divide-border/40">
            {PAYROLL_ROWS.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, x: -6 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="grid grid-cols-[auto,1fr,auto] sm:grid-cols-[auto,1fr,auto,auto] gap-3 px-3 sm:px-4 py-2 items-center"
              >
                <span className="text-ink-subtle">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-ink truncate">{r.name}</span>
                <span className="hidden sm:inline text-right text-ink-subtle">{r.role}</span>
                <span className="text-right text-ink num whitespace-nowrap">
                  {r.amount.toLocaleString("en-US")}{" "}
                  <span className="text-ink-subtle text-[10px]">USDC</span>
                </span>
              </motion.div>
            ))}
          </div>
          {/* Footer */}
          <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-t border-border/60 bg-surface/30">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
              <span className="text-ink-subtle uppercase tracking-eyebrow text-[10px]">
                Signers
              </span>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 w-3 rounded-full transition-colors duration-300",
                      i < signed ? "bg-accent" : "bg-border/60",
                    )}
                  />
                ))}
              </div>
              <span className="text-ink num text-[11px]">{signed}/4</span>
            </div>
            <div className="flex sm:block items-baseline justify-between sm:text-right">
              <span className="text-ink-subtle uppercase tracking-eyebrow text-[10px] sm:mr-2">
                Total
              </span>
              <span>
                <span className="font-display text-base font-semibold text-ink num">
                  <NumberFlow value={total} locales="en-US" format={{ maximumFractionDigits: 0 }} />
                </span>
                <span className="text-ink-subtle ml-1 text-[10px]">USDC</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   CASE 02 — Invoicing (phone-like mockup with QR)
   ──────────────────────────────────────────────────────────────────────── */

function InvoicingMockup() {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const claimUrl = "aegisz.xyz/claim/inv_8a4hk2q1z";

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(`https://${claimUrl}`, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#C9A86A", light: "#0d0e110d" },
    })
      .then((s) => !cancelled && setQrSvg(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <VisualFrame caption={{ left: "Acme Studio · bearer claim", right: "Awaiting · 47h" }}>
      <div className="grid grid-cols-1 md:grid-cols-2 min-h-[360px]">
        {/* Left: invoice details */}
        <div className="px-6 py-6 md:py-8 border-b md:border-b-0 md:border-r border-border/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Eyebrow as="div">Invoice 0182</Eyebrow>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-accent">
                <Sparkles className="h-2 w-2" />
                Bearer
              </span>
            </div>
            <h4 className="mt-2 font-display text-2xl font-semibold text-ink leading-tight">
              Acme Studio
            </h4>
            <p className="mt-1 text-sm text-ink-muted">Branding work · May</p>
            <div className="mt-5">
              <p className="text-[11px] font-mono uppercase tracking-eyebrow text-ink-subtle">
                Amount due
              </p>
              <p className="font-display text-3xl font-semibold text-ink num leading-tight mt-1">
                $2,400 <span className="text-base font-medium text-ink-muted">USDC</span>
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <Lock className="h-3 w-3 text-accent" />
              No wallet upfront. Recipient picks at claim.
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <Clock className="h-3 w-3 text-signal-warn" />
              Expires in 47 hours. Revoke any time.
            </div>
          </div>
        </div>

        {/* Right: QR */}
        <div className="px-6 py-6 md:py-8 flex flex-col items-center justify-center bg-bg/40">
          <p className="text-[11px] font-mono uppercase tracking-eyebrow text-ink-subtle mb-4">
            Scan to claim
          </p>
          <div className="relative h-40 w-40 rounded-xl border border-border/60 bg-bg p-3">
            {qrSvg ? (
              <div
                className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                // Safe: qrSvg is generated client-side by the qrcode lib from
                // the bound claimUrl. No untrusted input flows into __html.
                // biome-ignore lint/security/noDangerouslySetInnerHtml: locally-generated QR SVG
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="h-full w-full animate-pulse bg-surface" />
            )}
          </div>
          <p className="mt-4 font-mono text-[10px] text-ink-subtle truncate max-w-[180px]">
            {claimUrl}
          </p>
        </div>
      </div>
    </VisualFrame>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   CASE 03 — Audit (browser-like mockup with sparkline)
   ──────────────────────────────────────────────────────────────────────── */

function Sparkline() {
  const points = useMemo(
    () => [
      4, 6, 5, 7, 9, 8, 11, 14, 12, 13, 17, 15, 19, 18, 22, 24, 21, 26, 28, 25, 30, 33, 31, 36,
    ],
    [],
  );
  const w = 600;
  const h = 140;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / (max - min)) * (h - 16) - 8;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const fill = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Activity sparkline"
    >
      <title>Activity sparkline</title>
      <defs>
        <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1="0"
          y1={h * p}
          x2={w}
          y2={h * p}
          stroke="hsl(var(--border) / 0.5)"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />
      ))}
      <path d={fill} fill="url(#sparkfill)" />
      <motion.path
        d={path}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

const AUDITORS = [
  { name: "Marie", color: "from-violet-300 to-violet-700", role: "External CPA" },
  { name: "Dan", color: "from-teal-300 to-teal-700", role: "Compliance" },
];

function AuditMockup() {
  return (
    <VisualFrame caption={{ left: "Read-only audit link", right: "28 days · revocable" }}>
      <div className="flex flex-col">
        {/* Browser-like top bar */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-surface/40 px-4 py-2.5">
          <div className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          </div>
          <div className="ml-3 inline-flex items-center gap-1.5 rounded-md bg-bg/60 px-2.5 py-0.5 font-mono text-[10px] text-ink-subtle">
            <Lock className="h-2.5 w-2.5 text-signal-positive" />
            audit.aegisz.xyz/m_xx7qz
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <Eyebrow as="div">Scoped audit view</Eyebrow>
              <h4 className="mt-2 font-display text-xl font-semibold text-ink leading-tight">
                Treasury · last 30 days
              </h4>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-positive/30 bg-signal-positive/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-eyebrow text-signal-positive">
              <Eye className="h-2.5 w-2.5" />
              Read-only
            </span>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
                Transactions
              </p>
              <p className="font-display text-xl font-semibold text-ink num mt-0.5">
                <NumberFlow value={36} locales="en-US" />
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
                Approvers
              </p>
              <p className="font-display text-xl font-semibold text-ink num mt-0.5">4</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
                Categories
              </p>
              <p className="font-display text-xl font-semibold text-ink num mt-0.5">3</p>
            </div>
          </div>

          {/* Sparkline */}
          <div className="h-24 rounded-lg border border-border/60 bg-bg/40 p-3">
            <Sparkline />
          </div>

          {/* Auditors row */}
          <div className="flex items-center gap-3 pt-2">
            <p className="text-[10px] font-mono uppercase tracking-eyebrow text-ink-subtle">
              Shared with
            </p>
            <div className="flex items-center -space-x-1.5">
              {AUDITORS.map((a) => (
                <div
                  key={a.name}
                  className={cn(
                    "h-7 w-7 rounded-full bg-gradient-to-br ring-2 ring-bg flex items-center justify-center text-white font-display font-semibold text-xs",
                    a.color,
                  )}
                  title={`${a.name} · ${a.role}`}
                >
                  {a.name[0]}
                </div>
              ))}
            </div>
            <span className="ml-auto text-[11px] text-ink-subtle">
              <span className="text-ink-muted">{AUDITORS.length}</span> auditors
            </span>
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Case row layout
   ──────────────────────────────────────────────────────────────────────── */

function CaseRow({
  text,
  visual,
  reverse = false,
}: {
  text: React.ReactNode;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center")}>
      <ScrollReveal className={cn("lg:col-span-5", reverse ? "lg:order-2" : "lg:order-1")}>
        {text}
      </ScrollReveal>
      <ScrollReveal
        delay={0.08}
        className={cn("lg:col-span-7", reverse ? "lg:order-1" : "lg:order-2")}
      >
        {visual}
      </ScrollReveal>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Section
   ──────────────────────────────────────────────────────────────────────── */

export function BentoUseCases() {
  return (
    <section id="usecases" className="relative z-10 border-y border-border bg-surface/[0.06]">
      <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
        {/* Header */}
        <ScrollReveal>
          <div className="mb-16 md:mb-24 max-w-2xl mx-auto text-center">
            <Eyebrow as="div" className="mb-3">
              Use cases
            </Eyebrow>
            <h2 className="font-display text-display-sm font-bold text-ink leading-[1.05]">
              Things every treasury does. <span className="text-accent">Done without leaking.</span>
            </h2>
            <p className="mt-5 text-ink-muted leading-relaxed">
              One of these only Aegis does. The other two we just do better.
            </p>
          </div>
        </ScrollReveal>

        {/* Cases */}
        <div className="space-y-24 md:space-y-36">
          {/* CASE 01 — Bearer Invoice (the moat) */}
          <CaseRow
            text={
              <CaseText
                num="01"
                kicker="Bearer invoice"
                exclusive
                title="The only crypto invoice link that doesn't ask for the wallet upfront."
                body="Post a claim link to your site or DM it to a contractor. The recipient picks the destination wallet at claim time. Nothing else in the Solana privacy stack does this."
                bullets={[
                  "No recipient address required at issue.",
                  "Single-claim, default 24h expiry, fully revocable.",
                  "Bind to a wallet instead if you want a stricter mode.",
                ]}
              />
            }
            visual={<InvoicingMockup />}
          />

          {/* CASE 02 — Payroll */}
          <CaseRow
            reverse
            text={
              <CaseText
                num="02"
                kicker="Payroll"
                title="Run payroll without doxxing your team."
                body="Drop a CSV. Aegis bundles every line into a single shielded payout, signed once and executed atomically."
                bullets={[
                  "One Squads vote pays everyone, every line is shielded.",
                  "Salaries never appear on the public ledger.",
                  "Run it monthly. Your team won't see it on Solscan.",
                ]}
              />
            }
            visual={<PayrollMockup />}
          />

          {/* CASE 03 — Audit */}
          <CaseRow
            text={
              <CaseText
                num="03"
                kicker="Audit"
                title="Hand auditors exactly what they need."
                body="Generate read-only links scoped by date, member, or category. Exports are Ed25519-signed and verifiable offline. The public ledger stays blind."
                bullets={[
                  "Scope by date, member, or category.",
                  "Signed exports, tamper-evident, revokable.",
                  "Access log shows every view from every IP.",
                ]}
              />
            }
            visual={<AuditMockup />}
          />
        </div>

        {/* Foot */}
        <ScrollReveal delay={0.15}>
          <div className="mt-24 md:mt-32 text-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-surface/40 px-5 py-2.5">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span className="text-sm text-ink-muted">
                Squads multisig built in. Real governance. Fully private.
              </span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

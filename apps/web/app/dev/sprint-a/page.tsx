"use client";

/**
 * DEV-ONLY preview page for the Sprint A foundation utilities.
 *
 * Renders every new primitive in isolation so the visual rules can be
 * verified before they're consumed by Sprint B (sidebar + dashboard
 * redesign). Not linked from anywhere in the app — visit /dev/sprint-a
 * directly. Safe to delete once Sprint B lands.
 */

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { useTheme, type Theme } from "@/components/providers/ThemeProvider";
import { ReceiptRow } from "@/components/ui/receipt-row";
import { cn } from "@/lib/utils";
import { Lock, Monitor, Moon, Shield, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function ThemeToggleInline() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-surface p-0.5">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={label}
            title={label}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-xs transition-aegis",
              active
                ? "bg-accent text-accent-ink shadow-raise-1"
                : "text-ink-subtle hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ children, eyebrow }: { children: React.ReactNode; eyebrow: string }) {
  return (
    <div className="mb-4 mt-12 first:mt-0">
      <p className="label-editorial">{eyebrow}</p>
      <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
        {children}
      </h2>
    </div>
  );
}

export default function SprintAPreview() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="label-editorial">Aegis · Design</p>
            <h1 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-ink">
              Sprint A · Foundation Preview
            </h1>
          </div>
          <ThemeToggleInline />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* ── Card archetypes ─────────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 5 · Card system">Card archetypes</SectionTitle>

        <p className="mb-6 max-w-2xl text-sm text-ink-muted">
          Four distinct shells. The dashboard uses one of each — never
          repeats — so the page reads as a hierarchy, not a stack of
          identical containers.
        </p>

        {/* card-hero */}
        <div className="card-hero relative mb-4 p-8">
          <HeraldicWatermark />
          <p className="label-editorial">Total treasury · live</p>
          <p className="mt-3 font-display text-5xl font-semibold tabular-nums tracking-tight">
            $84,210.55
          </p>
          <p className="mt-1.5 font-mono text-sm tabular-nums text-ink-subtle/70">
            12.4023 SOL · 12,300.00 USDC
          </p>
          <p className="mt-6 max-w-md text-xs text-ink-subtle">
            <code className="font-mono">.card-hero</code> — anchor card. One per
            page. Embossed inset highlight + deep drop shadow + no hover
            reaction (this card doesn't react to you, you react to it).
          </p>
        </div>

        {/* card-panel × 3 */}
        <div className="mb-4 grid gap-3 lg:grid-cols-3">
          {[
            { label: "Inflow", value: "+12.4 SOL", sub: "≈ $1,240" },
            { label: "Outflow", value: "−8.2 SOL", sub: "≈ $820" },
            { label: "Privacy share", value: "78%", sub: "shielded · 30d" },
          ].map((kpi) => (
            <div key={kpi.label} className="card-panel relative p-5">
              <p className="label-editorial">{kpi.label} · 30d</p>
              <p className="mt-2.5 font-display text-3xl font-semibold tabular-nums tracking-tight">
                {kpi.value}
              </p>
              <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-muted">{kpi.sub}</p>
            </div>
          ))}
        </div>
        <p className="mb-8 text-xs text-ink-subtle">
          <code className="font-mono">.card-panel</code> — workhorse. Borders
          lift to <code className="font-mono">border-strong</code> on hover, no
          gold glow. Hover any card to verify.
        </p>

        {/* card-list */}
        <div className="card-list mb-4 p-2">
          {[
            { id: 42, label: "Send 4.2 SOL to Alice", meta: "2/3 approvals" },
            { id: 41, label: "Payroll · 8 recipients", meta: "3/3 ready" },
            { id: 40, label: "Swap 200 USDC → SOL", meta: "1/3 approvals" },
          ].map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition-aegis hover:bg-surface-2"
            >
              <span>
                <span className="mr-2 font-mono text-[11px] text-ink-subtle">#{row.id}</span>
                {row.label}
              </span>
              <span className="font-mono text-xs tabular-nums text-ink-subtle">{row.meta}</span>
            </div>
          ))}
        </div>
        <p className="mb-8 text-xs text-ink-subtle">
          <code className="font-mono">.card-list</code> — container only. Rows
          own their padding and hover state. Lists never nest panels.
        </p>

        {/* ── Privacy halo ─────────────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 5.1 · Decorative motion">Privacy halo</SectionTitle>
        <p className="mb-6 max-w-2xl text-sm text-ink-muted">
          The only decorative motion in the entire product. Two concentric
          arcs, 4s pulse, 2s offset. Reserved for the "% shielded" KPI on the
          dashboard. Honors{" "}
          <code className="font-mono text-[11px]">prefers-reduced-motion</code>.
        </p>

        <div className="mb-12 grid gap-3 lg:grid-cols-2">
          <div className="card-panel privacy-halo relative p-6">
            <p className="label-editorial">
              <Shield className="mr-1 inline h-3 w-3" /> Privacy share · 30d
            </p>
            <p className="mt-2.5 font-display text-4xl font-semibold tabular-nums tracking-tight text-accent">
              78%
            </p>
            <p className="mt-1 text-xs text-ink-muted">12 private · 4 public</p>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent" style={{ width: "78%" }} />
              <div className="h-full bg-ink-subtle/50" style={{ width: "22%" }} />
            </div>
          </div>

          <div className="card-panel relative p-6">
            <p className="label-editorial">For comparison · no halo</p>
            <p className="mt-2.5 font-display text-4xl font-semibold tabular-nums tracking-tight text-ink">
              42
            </p>
            <p className="mt-1 text-xs text-ink-muted">Identical card without the halo class.</p>
          </div>
        </div>

        {/* ── Heraldic watermark sizes ────────────────────────────────── */}
        <SectionTitle eyebrow="Section 5.1 · Brand moment">Heraldic watermark</SectionTitle>
        <p className="mb-6 max-w-2xl text-sm text-ink-muted">
          The Æ glyph, EB Garamond, accent-tinted, 4% opacity by default.
          Used inside hero cards and modals only — never on KPI panels.
        </p>

        <div className="mb-12 grid gap-3 lg:grid-cols-2">
          <div className="card-hero relative h-44 p-6">
            <HeraldicWatermark size={280} opacity={0.04} />
            <p className="label-editorial">Default · 280px / 4%</p>
            <p className="mt-2 text-sm text-ink-muted">
              Hero card — quiet, embedded in the surface.
            </p>
          </div>
          <div className="card-hero relative h-44 p-6">
            <HeraldicWatermark size={200} opacity={0.08} className="-bottom-6 -right-6" />
            <p className="label-editorial">Modal · 200px / 8%</p>
            <p className="mt-2 text-sm text-ink-muted">
              Smaller, slightly more present — fits a modal's tighter frame.
            </p>
          </div>
        </div>

        {/* ── Receipt rows ─────────────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 6 · Modal pattern">Receipt rows</SectionTitle>
        <p className="mb-6 max-w-2xl text-sm text-ink-muted">
          Dotted-leader pattern for "we are about to sign value" surfaces.
          Default tone is ink, monospace, tabular. Override per row when you
          need to draw the eye to a fee or a destination.
        </p>

        <div className="card-hero relative mb-12 p-7">
          <HeraldicWatermark size={240} opacity={0.05} />
          <p className="label-editorial">Confirm transaction</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-ink">
            Send 4.2 SOL · shielded
          </h3>
          <div className="mt-5">
            <ReceiptRow label="Amount">4.2000 SOL</ReceiptRow>
            <ReceiptRow label="To">7uX1…9pNk</ReceiptRow>
            <ReceiptRow label="Memo" mono={false}>
              Q4 contributor payout
            </ReceiptRow>
            <ReceiptRow label="Network fee" tone="muted">
              0.000005 SOL
            </ReceiptRow>
            <ReceiptRow label="Privacy" tone="accent">
              <Lock className="mr-1 inline h-3 w-3" />
              Shielded via Cloak
            </ReceiptRow>
            <ReceiptRow label="Slippage" tone="danger">
              0.45%
            </ReceiptRow>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md border border-border-strong px-4 text-xs font-semibold text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-xs font-semibold text-accent-ink shadow-raise-1 transition-aegis hover:bg-accent-hover"
            >
              Send 4.2 SOL
            </button>
          </div>
        </div>

        {/* ── Editorial label ──────────────────────────────────────────── */}
        <SectionTitle eyebrow="Section 3 · Editorial moment">label-editorial</SectionTitle>
        <p className="mb-6 max-w-2xl text-sm text-ink-muted">
          Italic Fraunces section label, replaces the all-caps Inter eyebrow
          everywhere. Reads like a vintage ledger — nobody else in crypto
          fintech does this, which is exactly why we should.
        </p>

        <div className="card-panel mb-12 grid gap-6 p-6 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-subtle/60">
              Before · uppercase Inter
            </p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">$12,400</p>
          </div>
          <div>
            <p className="label-editorial">After · italic Fraunces</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">$12,400</p>
          </div>
        </div>

        {/* ── Token reference ──────────────────────────────────────────── */}
        <SectionTitle eyebrow="Reference">Tokens · live in this theme</SectionTitle>
        <div className="card-panel grid gap-3 p-6 sm:grid-cols-3">
          {[
            { name: "bg", swatch: "bg-bg" },
            { name: "surface", swatch: "bg-surface" },
            { name: "surface-2", swatch: "bg-surface-2" },
            { name: "surface-3", swatch: "bg-surface-3" },
            { name: "surface-content", swatch: "bg-surface-content" },
            { name: "border", swatch: "bg-border" },
            { name: "border-strong", swatch: "bg-border-strong" },
            { name: "accent", swatch: "bg-accent" },
            { name: "accent-hover", swatch: "bg-accent-hover" },
            { name: "accent-soft", swatch: "bg-accent-soft" },
            { name: "ink", swatch: "bg-ink" },
            { name: "ink-muted", swatch: "bg-ink-muted" },
            { name: "ink-subtle", swatch: "bg-ink-subtle" },
            { name: "signal-positive", swatch: "bg-signal-positive" },
            { name: "signal-warn", swatch: "bg-signal-warn" },
            { name: "signal-danger", swatch: "bg-signal-danger" },
          ].map((t) => (
            <div key={t.name} className="flex items-center gap-2.5">
              <div
                className={cn("h-7 w-7 rounded-md border border-border", t.swatch)}
                aria-hidden="true"
              />
              <span className="font-mono text-[11px] text-ink-muted">{t.name}</span>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-ink-subtle">
          Switch the theme above to see every token re-bind. Light surfaces
          should read as warm cream paper, not white. Dark surfaces should
          read as near-black vault, not flat gray.
        </p>
      </main>
    </div>
  );
}

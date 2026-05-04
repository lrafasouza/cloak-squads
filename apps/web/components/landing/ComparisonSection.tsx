"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Check,
  ClipboardList,
  Eye,
  FileText,
  KeyRound,
  Landmark,
  Minus,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";
import { Eyebrow } from "../ui/aegis";

interface FeatureRow {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  squads: string;
  aegis: string;
  highlight: boolean;
}

const features: FeatureRow[] = [
  {
    id: "approvals",
    label: "Treasury Approvals",
    icon: ShieldCheck,
    squads: "Multisig proposals & threshold voting",
    aegis: "Same Squads flow — unchanged",
    highlight: false,
  },
  {
    id: "privacy",
    label: "Transaction Privacy",
    icon: Eye,
    squads: "Fully public amounts & addresses",
    aegis: "Shielded with Cloak Protection",
    highlight: true,
  },
  {
    id: "payroll",
    label: "Team Payroll",
    icon: Users,
    squads: "Manual batch transactions",
    aegis: "CSV import, preview & execute",
    highlight: true,
  },
  {
    id: "invoices",
    label: "Client Invoicing",
    icon: FileText,
    squads: "Not available in Squads",
    aegis: "Private links + QR claim",
    highlight: true,
  },
  {
    id: "audit",
    label: "Audit & Compliance",
    icon: ClipboardList,
    squads: "Generic explorer history",
    aegis: "Scoped audit links + CSV export",
    highlight: true,
  },
  {
    id: "execution",
    label: "Execution Model",
    icon: KeyRound,
    squads: "Any member executes manually",
    aegis: "Dedicated operator wallet",
    highlight: true,
  },
];

const tableVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
};

function ColumnHeader({ side }: { side: "squads" | "aegis" }) {
  const isAegis = side === "aegis";
  return (
    <div className="flex items-center gap-3 mb-6 md:mb-8">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
          isAegis
            ? "bg-accent-soft border-accent/30"
            : "bg-surface border-border"
        )}
      >
        {isAegis ? (
          <Sparkles className="h-5 w-5 text-accent" />
        ) : (
          <Landmark className="h-5 w-5 text-ink-subtle" />
        )}
      </div>
      <div>
        <p
          className={cn(
            "text-sm font-semibold uppercase tracking-wider",
            isAegis ? "text-accent" : "text-ink-subtle"
          )}
        >
          {isAegis ? "What Aegis adds on top" : "What Squads gives you"}
        </p>
        <p className="text-[11px] text-ink-subtle leading-tight">
          {isAegis ? "The extension layer" : "The foundation"}
        </p>
      </div>
    </div>
  );
}

function RowItem({ feature, side }: { feature: FeatureRow; side: "squads" | "aegis" }) {
  const Icon = feature.icon;
  const isAegis = side === "aegis";
  const isHighlight = isAegis && feature.highlight;

  return (
    <div className="flex items-start gap-3 py-4 md:py-5">
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border mt-0.5",
          isHighlight
            ? "bg-accent-soft/60 border-accent/25"
            : "bg-surface border-border"
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            isHighlight ? "text-accent" : "text-ink-subtle"
          )}
        />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-0.5">
          {feature.label}
        </p>
        <div className="flex items-center gap-2">
          {isAegis ? (
            <Check
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isHighlight ? "text-accent" : "text-ink-subtle/70"
              )}
              strokeWidth={2.5}
            />
          ) : (
            <Minus className="h-3.5 w-3.5 shrink-0 text-ink-subtle/60" />
          )}
          <p
            className={cn(
              "text-sm leading-relaxed",
              isHighlight ? "text-ink font-medium" : "text-ink-muted"
            )}
          >
            {isAegis ? feature.aegis : feature.squads}
          </p>
        </div>
      </div>
    </div>
  );
}

function DesktopTable() {
  return (
    <motion.div
      variants={tableVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      className="hidden md:grid grid-cols-2 gap-8"
    >
      <div>
        <ColumnHeader side="squads" />
        <div className="rounded-xl border border-border bg-bg overflow-hidden">
          {features.map((feature, i) => (
            <motion.div
              key={feature.id}
              variants={rowVariants}
              className={cn(
                "px-5",
                i !== features.length - 1 && "border-b border-border/50"
              )}
            >
              <RowItem feature={feature} side="squads" />
            </motion.div>
          ))}
        </div>
      </div>

      <div>
        <ColumnHeader side="aegis" />
        <div className="rounded-xl border border-border/80 bg-surface/[0.25] overflow-hidden">
          {features.map((feature, i) => (
            <motion.div
              key={feature.id}
              variants={rowVariants}
              className={cn(
                "px-5",
                feature.highlight && "bg-accent/[0.02]",
                i !== features.length - 1 && "border-b border-border/40"
              )}
            >
              <RowItem feature={feature} side="aegis" />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function MobileStack() {
  return (
    <motion.div
      variants={tableVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="md:hidden space-y-6"
    >
      <div>
        <ColumnHeader side="squads" />
        <div className="rounded-xl border border-border bg-bg overflow-hidden">
          {features.map((feature, i) => (
            <motion.div
              key={feature.id}
              variants={rowVariants}
              className={cn(
                "px-4",
                i !== features.length - 1 && "border-b border-border/50"
              )}
            >
              <RowItem feature={feature} side="squads" />
            </motion.div>
          ))}
        </div>
      </div>

      <div>
        <ColumnHeader side="aegis" />
        <div className="rounded-xl border border-border/80 bg-surface/[0.25] overflow-hidden">
          {features.map((feature, i) => (
            <motion.div
              key={feature.id}
              variants={rowVariants}
              className={cn(
                "px-4",
                feature.highlight && "bg-accent/[0.02]",
                i !== features.length - 1 && "border-b border-border/40"
              )}
            >
              <RowItem feature={feature} side="aegis" />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function BottomLine() {
  return (
    <ScrollReveal delay={0.15}>
      <div className="mt-14 md:mt-20 max-w-xl mx-auto text-center">
        <div className="h-px w-16 bg-border mx-auto mb-8" />
        <p className="text-sm text-ink-muted leading-relaxed">
          Aegis is built on top of Squads Protocol v4. We wrap your treasury with private execution,
          payroll workflows, invoicing, and scoped audit, all while keeping
          your existing Squads approval layer intact.
        </p>
      </div>
    </ScrollReveal>
  );
}

export function ComparisonSection() {
  return (
    <section id="comparison" className="relative z-10">
      <div className="relative mx-auto max-w-5xl px-4 py-24 md:px-6 md:py-32">
        <ScrollReveal>
          <div className="mb-12 md:mb-16 max-w-xl mx-auto text-center">
            <Eyebrow as="div" className="mb-3">
              Comparison
            </Eyebrow>
            <h2 className="font-display text-display-sm font-bold text-ink">
              Built on Squads. Extended for privacy.
            </h2>
            <p className="mt-4 text-ink-muted leading-relaxed">
              Squads is the approval layer you already trust. Aegis adds
              privacy, payroll, invoicing, and scoped audit on top.
            </p>
          </div>
        </ScrollReveal>

        <DesktopTable />
        <MobileStack />
        <BottomLine />
      </div>
    </section>
  );
}

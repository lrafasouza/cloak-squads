"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  EyeOff,
  Flame,
  KeyRound,
  Layers,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "../ui/aegis";
import { ScrollReveal } from "./ScrollReveal";

/* ────────────────────────────────────────────────────────────────────────────
   Step content — short, plain-English
   ──────────────────────────────────────────────────────────────────────── */

type StepDef = {
  id: string;
  num: string;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const STEPS: StepDef[] = [
  {
    id: "propose",
    num: "01",
    title: "Anyone proposes",
    body: "A team member drafts a payment inside your Aegis vault on Solana.",
    Icon: ShieldCheck,
  },
  {
    id: "approve",
    num: "02",
    title: "The team approves",
    body: "Same threshold, same governance. Aegis never overrides your vote.",
    Icon: Users,
  },
  {
    id: "shield",
    num: "03",
    title: "A private approval",
    body: "Aegis mints a single-use, time-bound approval, scoped to this payment only.",
    Icon: Layers,
  },
  {
    id: "execute",
    num: "04",
    title: "It ships, privately",
    body: "The payment settles on Solana. Recipient and amount stay between your team.",
    Icon: EyeOff,
  },
];

/* ────────────────────────────────────────────────────────────────────────────
   Diagram — horizontal node flow
   ──────────────────────────────────────────────────────────────────────── */

type NodeState = "dim" | "active" | "done";

function nodeFor(active: number, threshold: number): NodeState {
  if (active < threshold) return "dim";
  if (active === threshold) return "active";
  return "done";
}

function FlowNode({
  Icon,
  label,
  state,
  large = false,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  state: NodeState;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 shrink-0">
      <div className="relative">
        {state === "active" && (
          <motion.div
            layoutId="anatomy-glow"
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: "0 0 0 8px hsl(var(--accent) / 0.12), 0 0 32px hsl(var(--accent) / 0.4)",
            }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
          />
        )}
        <div
          className={cn(
            "relative flex items-center justify-center rounded-full border-2 transition-all duration-500",
            large ? "h-16 w-16 md:h-20 md:w-20" : "h-12 w-12 md:h-14 md:w-14",
            state === "dim" && "border-border bg-surface/60",
            state === "active" && "border-accent bg-accent-soft",
            state === "done" && "border-accent/40 bg-accent-soft/40",
          )}
        >
          <Icon
            className={cn(
              "transition-colors duration-500",
              large ? "h-7 w-7 md:h-8 md:w-8" : "h-5 w-5 md:h-6 md:w-6",
              state === "dim" ? "text-ink-subtle" : "text-accent",
            )}
            strokeWidth={1.5}
          />
        </div>
      </div>
      <span
        className={cn(
          "text-[10px] md:text-[11px] font-mono uppercase tracking-eyebrow transition-colors duration-500 text-center",
          state === "dim" ? "text-ink-subtle" : "text-ink",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function FlowBeam({ state, animated }: { state: NodeState; animated: boolean }) {
  const stroke =
    state === "active"
      ? "hsl(var(--accent))"
      : state === "done"
        ? "hsl(var(--accent) / 0.55)"
        : "hsl(var(--border))";
  return (
    <div className="relative flex-1 h-px min-w-[24px] md:min-w-[40px]" aria-hidden>
      <svg
        className="absolute inset-0 w-full h-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 1"
      >
        <line
          x1="0"
          y1="0.5"
          x2="100"
          y2="0.5"
          stroke={stroke}
          strokeWidth="1.25"
          strokeDasharray={animated ? "4 4" : "0"}
          className={animated ? "anatomy-beam" : ""}
          vectorEffect="non-scaling-stroke"
          style={{ transition: "stroke 0.4s ease" }}
        />
      </svg>
    </div>
  );
}

function FlowDiagram({ active }: { active: number }) {
  const sSquads = nodeFor(active, 0);
  const sTeam = nodeFor(active, 1);
  const sShield = nodeFor(active, 2);
  const sShipped = nodeFor(active, 3);

  // Beam states (between nodes)
  const b1 = active >= 1 ? (active === 1 ? "active" : "done") : "dim";
  const b2 = active >= 2 ? (active === 2 ? "active" : "done") : "dim";
  const b3 = active >= 3 ? (active === 3 ? "active" : "done") : "dim";

  return (
    <div className="relative">
      {/* Permission badge appears on stage 3 */}
      <div className="relative h-10 mb-2">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{
            opacity: active === 2 ? 1 : active === 3 ? 0.6 : 0,
            y: active >= 2 ? 0 : 6,
          }}
          transition={{ duration: 0.4 }}
          className="absolute left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1"
        >
          <span className="font-mono text-[10px] uppercase tracking-eyebrow text-accent">
            Single-use · 60s
          </span>
          {active === 3 && (
            <Flame className="h-3 w-3 text-signal-danger" />
          )}
        </motion.div>
      </div>

      {/* Flow row */}
      <div className="flex items-center gap-1 md:gap-2 px-2 md:px-6">
        <FlowNode
          Icon={STEPS[0]!.Icon}
          label="Vault"
          state={sSquads as NodeState}
          large
        />
        <FlowBeam state={b1 as NodeState} animated={active === 1} />
        <FlowNode
          Icon={STEPS[1]!.Icon}
          label="Team"
          state={sTeam as NodeState}
          large
        />
        <FlowBeam state={b2 as NodeState} animated={active === 2} />
        <FlowNode
          Icon={STEPS[2]!.Icon}
          label="Approval"
          state={sShield}
          large
        />
        <FlowBeam state={b3 as NodeState} animated={active === 3} />
        <FlowNode
          Icon={KeyRound}
          label="Operator"
          state={sShipped}
        />
        <FlowBeam state={(active >= 3 ? "active" : "dim") as NodeState} animated={active === 3} />
        <FlowNode
          Icon={STEPS[3]!.Icon}
          label="Sent"
          state={sShipped}
          large
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Section
   ──────────────────────────────────────────────────────────────────────── */

const CYCLE_MS = 3200;

export function AnatomyScrollytelling() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);

  // Activate auto-cycle only when section is visible
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([e]) => setInView(e?.isIntersecting ?? false),
      { threshold: 0.3 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || paused) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), CYCLE_MS);
    return () => clearTimeout(t);
  }, [active, inView, paused]);

  return (
    <section
      id="anatomy"
      ref={sectionRef}
      className="relative z-10 border-y border-border/60 bg-bg"
    >
      <div className="mx-auto max-w-7xl px-4 py-24 md:px-6 md:py-32">
        {/* Header */}
        <ScrollReveal>
          <div className="mb-14 md:mb-16 max-w-2xl mx-auto text-center">
            <Eyebrow as="div" className="mb-3">How it works</Eyebrow>
            <h2 className="font-display text-display-sm font-bold text-ink leading-[1.05]">
              Privacy in <span className="text-accent">four steady steps</span>.
            </h2>
            <p className="mt-4 text-ink-muted leading-relaxed">
              Aegis sits on top of Squads. The flow stays familiar. The privacy is automatic.
            </p>
          </div>
        </ScrollReveal>

        {/* Diagram card — desktop only (flow doesn't fit on mobile) */}
        <ScrollReveal delay={0.05} className="hidden md:block">
          <div
            className="relative rounded-2xl border border-border/60 bg-surface/30 px-4 md:px-8 py-8 md:py-12 mb-8 md:mb-10 overflow-hidden"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 50%, hsl(var(--accent) / 0.06), transparent 60%)",
              }}
            />
            <div className="relative">
              <FlowDiagram active={active} />
            </div>
          </div>
        </ScrollReveal>

        {/* Step cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 mt-10 md:mt-0">
          {STEPS.map((s, i) => {
            const isActive = i === active;
            const isPast = i < active;
            const Icon = s.Icon;
            return (
              <ScrollReveal key={s.id} delay={i * 0.05} distance={16}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  onMouseEnter={() => {
                    setPaused(true);
                    setActive(i);
                  }}
                  onMouseLeave={() => setPaused(false)}
                  className={cn(
                    "group relative w-full text-left rounded-xl border p-5 transition-all duration-500 overflow-hidden",
                    isActive
                      ? "border-accent/40 bg-accent/[0.04]"
                      : "border-border/60 bg-surface/30 hover:border-border-strong",
                  )}
                >
                  {/* Progress bar (top edge) */}
                  {isActive && !paused && inView && (
                    <motion.div
                      key={`bar-${active}`}
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: CYCLE_MS / 1000, ease: "linear" }}
                      className="absolute top-0 left-0 h-px bg-accent"
                    />
                  )}

                  <div className="flex items-center justify-between mb-3.5">
                    <span
                      className={cn(
                        "font-mono text-[11px] uppercase tracking-eyebrow transition-colors",
                        isActive
                          ? "text-accent"
                          : isPast
                            ? "text-ink-muted"
                            : "text-ink-subtle",
                      )}
                    >
                      Step {s.num}
                    </span>
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                        isActive
                          ? "bg-accent-soft border-accent/40"
                          : "bg-surface border-border",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isActive ? "text-accent" : "text-ink-subtle",
                        )}
                        strokeWidth={1.6}
                      />
                    </div>
                  </div>

                  <h3
                    className={cn(
                      "font-display text-base md:text-lg font-semibold leading-tight transition-colors",
                      isActive || isPast ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {s.title}
                  </h3>
                  <p
                    className={cn(
                      "mt-1.5 text-xs md:text-sm leading-relaxed transition-colors",
                      isActive ? "text-ink-muted" : "text-ink-subtle",
                    )}
                  >
                    {s.body}
                  </p>
                </button>
              </ScrollReveal>
            );
          })}
        </div>

        {/* Foot note */}
        <ScrollReveal delay={0.2}>
          <p className="mt-10 md:mt-12 text-center text-xs text-ink-subtle">
            <span className="md:hidden">Tap any step to pause the cycle.</span>
            <span className="hidden md:inline">Hover any step to pause the cycle.</span>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

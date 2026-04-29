"use client";

import { CreateMultisigCard } from "@/components/create-multisig/CreateMultisigCard";
import { FAQ } from "@/components/landing/FAQ";
import { HeroDiagram } from "@/components/landing/HeroDiagram";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Eyebrow } from "@/components/ui/aegis";
import { StaggerContainer, StaggerItem } from "@/components/ui/animations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { motion } from "framer-motion";
import {
  Eye,
  FileText,
  Key,
  Lock,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/* ── Redirect ?multisig= param ── */
function useRedirectParam() {
  const [redirected, setRedirected] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const url = new URL(window.location.href);
    const target = url.searchParams.get("multisig");
    if (target) {
      try {
        new PublicKey(target);
        router.replace(`/cofre/${target}`);
        setRedirected(true);
      } catch {
        /* ignore invalid pubkey */
      }
    }
  }, [router]);
  return redirected;
}

/* ── Trust bar ── */
const trustItems = [
  { icon: Shield, label: "ZK Privacy" },
  { icon: Lock, label: "End-to-end encrypted" },
  { icon: Users, label: "Multi-sig security" },
  { icon: ShieldCheck, label: "Auditable" },
  { icon: Zap, label: "Solana L1" },
];

function TrustBar() {
  return (
    <div className="border-y border-border bg-surface/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6">
        {trustItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm text-ink-subtle">
            <item.icon className="h-4 w-4 text-accent/60" />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Step card ── */
function StepCard({
  number,
  title,
  description,
  icon: Icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <StaggerItem>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
        className="relative rounded-xl border border-border bg-surface/60 p-6 backdrop-blur-sm"
      >
        <div className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent border border-accent/30">
          {number}
        </div>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-soft">
          <Icon className="h-6 w-6 text-accent" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
        <p className="text-sm leading-relaxed text-ink-muted">{description}</p>
      </motion.div>
    </StaggerItem>
  );
}

/* ── Feature card ── */
function FeatureCard({
  icon: Icon,
  title,
  description,
  tag,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  tag?: string;
}) {
  return (
    <StaggerItem>
      <motion.div
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
        className="group relative overflow-hidden rounded-xl border border-border bg-surface/60 p-6 backdrop-blur-sm"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
              <Icon className="h-5 w-5 text-accent" />
            </div>
            {tag && (
              <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                {tag}
              </span>
            )}
          </div>
          <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
          <p className="text-sm leading-relaxed text-ink-muted">{description}</p>
        </div>
      </motion.div>
    </StaggerItem>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePage() {
  const redirected = useRedirectParam();
  const wallet = useWallet();
  const { addToast } = useToast();
  const router = useRouter();

  const [multisigInput, setMultisigInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  if (redirected) return null;

  function onOpenMultisig(e: React.FormEvent) {
    e.preventDefault();
    setInputError(null);
    const trimmed = multisigInput.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const pk = new PublicKey(trimmed);
      addToast("Opening vault...", "info", 2000);
      router.push(`/cofre/${pk.toBase58()}`);
    } catch {
      setInputError("Invalid Solana address");
      addToast("Invalid Solana address", "error");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-bg text-ink">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="absolute inset-0 bg-grid-faint bg-grid-md opacity-30" />
      </div>

      <SiteHeader />

      {/* ═══════════ HERO ═══════════ */}
      <section id="hero" className="relative z-10">
        <div className="mx-auto max-w-7xl px-4 pt-20 pb-10 md:px-6 md:pt-28 md:pb-16">
          <StaggerContainer className="mx-auto max-w-3xl text-center" staggerDelay={0.15}>
            <StaggerItem>
              <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-warn opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-warn" />
                </span>
                <span className="text-eyebrow text-accent">Devnet Live</span>
              </div>
            </StaggerItem>

            <StaggerItem>
              <h1 className="font-display text-display font-bold text-ink">
                Private Execution for
                <br />
                <span className="text-accent">Shared Treasuries</span>
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted md:text-xl">
                Shielded multisig operations on Solana. Send, receive, and manage funds
                without revealing amounts or counterparties on-chain.
              </p>
            </StaggerItem>

            <StaggerItem>
              <div className="mx-auto mt-10 max-w-xl">
                <form
                  onSubmit={onOpenMultisig}
                  className="flex flex-col gap-3 sm:flex-row sm:items-start"
                >
                  <div className="flex-1">
                    <Input
                      id="hero-input"
                      type="text"
                      placeholder="Enter Squads multisig address..."
                      value={multisigInput}
                      onChange={(e) => {
                        setMultisigInput(e.target.value);
                        setInputError(null);
                      }}
                      className="h-12 font-mono"
                    />
                    {inputError && (
                      <p className="mt-2 text-left text-sm text-signal-danger">{inputError}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !multisigInput.trim()}
                    isLoading={isSubmitting}
                    size="lg"
                    className="shrink-0"
                  >
                    Open Vault
                  </Button>
                </form>
                <p className="mt-3 text-xs text-ink-subtle">
                  Or{" "}
                  <Link
                    href="#create"
                    className="text-accent hover:text-accent-hover underline underline-offset-2"
                  >
                    create a new multisig
                  </Link>{" "}
                  to get started.
                </p>
              </div>
            </StaggerItem>
          </StaggerContainer>

          <HeroDiagram />
        </div>
      </section>

      <TrustBar />

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section id="how" className="relative z-10">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
          <StaggerContainer staggerDelay={0.1}>
            <StaggerItem>
              <div className="mb-16 text-center">
                <Eyebrow as="div" className="mb-3">How it works</Eyebrow>
                <h2 className="font-display text-display-sm font-bold text-ink">
                  Three steps to privacy
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-ink-muted">
                  Private, auditable transactions with your existing Squads setup.
                </p>
              </div>
            </StaggerItem>

            <div className="grid gap-6 md:grid-cols-3">
              <StepCard
                number="1"
                icon={Send}
                title="Prepare"
                description="Create a private transfer proposal inside your Squads vault. Set the amount, recipient stealth pubkey, and optional memo."
              />
              <StepCard
                number="2"
                icon={ShieldCheck}
                title="Approve"
                description="Multisig members review the proposal, verify the zero-knowledge commitment, and vote to approve or reject."
              />
              <StepCard
                number="3"
                icon={Zap}
                title="Execute"
                description="The operator consumes the approved license and executes the private transfer, shielding the transaction details."
              />
            </div>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════════ USE CASES ═══════════ */}
      <section id="usecases" className="relative z-10 border-y border-border bg-surface/30">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
          <StaggerContainer staggerDelay={0.1}>
            <StaggerItem>
              <div className="mb-16 text-center">
                <Eyebrow as="div" className="mb-3">Use cases</Eyebrow>
                <h2 className="font-display text-display-sm font-bold text-ink">
                  Everything you need
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-ink-muted">
                  Built for teams that demand both privacy and accountability.
                </p>
              </div>
            </StaggerItem>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={Eye}
                title="Private Sends"
                description="Hide amounts and recipients on-chain using zero-knowledge proofs."
              />
              <FeatureCard
                icon={Users}
                title="Payroll Batches"
                description="Process multi-recipient payroll in a single Squads proposal."
                tag="New"
              />
              <FeatureCard
                icon={FileText}
                title="Stealth Invoicing"
                description="Generate encrypted invoices with claim URLs for private withdrawals."
              />
              <FeatureCard
                icon={Shield}
                title="Scoped Audit Links"
                description="Create time-bound, permissioned audit views for compliance."
              />
              <FeatureCard
                icon={RefreshCw}
                title="Operator Flow"
                description="Separate operator wallet executes without signer private keys."
              />
              <FeatureCard
                icon={Key}
                title="Commitment Checks"
                description="Verify on-chain commitments locally before signing anything."
              />
            </div>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════════ SECURITY ═══════════ */}
      <section id="security" className="relative z-10">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow as="div" className="mb-3">Security</Eyebrow>
            <h2 className="font-display text-display-sm font-bold text-ink">
              Trust architecture
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-ink-muted">
              Aegis never holds your keys. The on-chain Gatekeeper program issues single-use,
              time-limited licenses that only a registered Operator can consume. Every action is
              auditable through scoped viewing keys.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-3">
            {[
              {
                icon: Lock,
                title: "Single-use licenses",
                desc: "Each license expires after one execution or TTL timeout.",
              },
              {
                icon: Shield,
                title: "No key custody",
                desc: "Aegis never touches signer private keys. Operators only consume licenses.",
              },
              {
                icon: Key,
                title: "Viewing keys",
                desc: "Generate scoped, revocable audit links for compliance without revealing everything.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-border bg-surface/60 p-5 backdrop-blur-sm"
              >
                <item.icon className="mb-3 h-6 w-6 text-accent" />
                <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-sm text-ink-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <section id="docs" className="relative z-10 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
          <div className="mb-12 text-center">
            <Eyebrow as="div" className="mb-3">FAQ</Eyebrow>
            <h2 className="font-display text-display-sm font-bold text-ink">
              Common questions
            </h2>
          </div>
          <FAQ />
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section id="create" className="relative z-10 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
          <StaggerContainer staggerDelay={0.1}>
            <StaggerItem>
              <div className="mx-auto max-w-4xl">
                <div className="mb-10 text-center">
                  <h2 className="font-display text-display-sm font-bold text-ink">
                    Ready to go private?
                  </h2>
                  <p className="mt-4 text-ink-muted">
                    Connect your wallet and open an existing Squads multisig, or create a new one in
                    seconds.
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-start">
                  <div className="rounded-xl border border-border bg-surface/80 p-6 shadow-raise-1 backdrop-blur-sm">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
                      <Send className="h-5 w-5 text-accent" />
                    </div>
                    <h3 className="text-sm font-semibold text-ink">
                      Open an existing multisig
                    </h3>
                    <p className="mt-2 text-sm text-ink-subtle">
                      Jump back to the address field and open any Squads multisig PDA.
                    </p>
                    <Button
                      size="lg"
                      variant="default"
                      className="mt-6 w-full"
                      onClick={() => {
                        const el = document.getElementById("hero-input");
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        el?.focus({ preventScroll: true });
                      }}
                    >
                      <Send className="h-5 w-5 mr-2" />
                      Open a Vault
                    </Button>

                    {!wallet.connected && (
                      <p className="mt-4 text-xs text-ink-subtle">
                        You&apos;ll need a Solana wallet to interact with Aegis.
                      </p>
                    )}
                  </div>

                  <CreateMultisigCard
                    onCreated={(multisigPda) => router.push(`/cofre/${multisigPda}`)}
                  />
                </div>

                <div className="mt-8 flex justify-center">
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  >
                    Back to top
                  </Button>
                </div>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

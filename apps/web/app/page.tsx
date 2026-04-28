"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { CreateMultisigCard } from "@/components/create-multisig/CreateMultisigCard";
import { useToast } from "@/components/ui/toast-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StaggerContainer, StaggerItem } from "@/components/ui/animations";

/* ── Page entry: if user lands on / with a ?multisig= param, forward them ── */
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

/* ── Animated gradient orbs background ── */
function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      <motion.div
        className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-emerald-500/5 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-teal-500/5 blur-3xl"
        animate={{ x: [0, -20, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-emerald-900/10 blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/* ── Trust bar ── */
function TrustBar() {
  const items = [
    { icon: "shield", label: "ZK Privacy" },
    { icon: "lock", label: "End-to-end encrypted" },
    { icon: "users", label: "Multi-sig security" },
    { icon: "check", label: "Auditable" },
    { icon: "zap", label: "Solana L1" },
  ];

  return (
    <div className="border-y border-neutral-800/50 bg-neutral-950/50 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6"
      >
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm text-neutral-500"
          >
            <FeatureIcon name={item.icon} className="h-4 w-4 text-emerald-500/60" />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Small icon helper ── */
function FeatureIcon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    users: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
    check: "M5 13l4 4L19 7",
    zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    send: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
    file: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z",
    repeat: "M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3",
    key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5",
    hash: "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
  };
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name] ?? paths.shield} />
    </svg>
  );
}

/* ── How it works step ── */
function StepCard({
  number,
  title,
  description,
  icon,

}: {
  number: string;
  title: string;
  description: string;
  icon: string;

}) {
  return (
    <StaggerItem>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
        className="relative rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 backdrop-blur-sm"
      >
        <div className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400 border border-emerald-500/30"
        >
          {number}
        </div>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10"
        >
          <FeatureIcon name={icon} className="h-6 w-6 text-emerald-400" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-neutral-100">{title}</h3>
        <p className="text-sm leading-relaxed text-neutral-400">{description}</p>
      </motion.div>
    </StaggerItem>
  );
}

/* ── Feature card ── */
function FeatureCard({
  icon,
  title,
  description,
  tag,
}: {
  icon: string;
  title: string;
  description: string;
  tag?: string;
}) {
  return (
    <StaggerItem>
      <motion.div
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
        className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 backdrop-blur-sm"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative"
        >
          <div className="mb-4 flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10"
            >
              <FeatureIcon name={icon} className="h-5 w-5 text-emerald-400" />
            </div>
            {tag && (
              <span className="rounded-full border border-emerald-800/50 bg-emerald-950/50 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
              >
                {tag}
              </span>
            )}
          </div>
          <h3 className="mb-2 text-lg font-semibold text-neutral-100">{title}</h3>
          <p className="text-sm leading-relaxed text-neutral-400">{description}</p>
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

  if (redirected) return null; // already forwarding

  function onOpenMultisig(e: React.FormEvent) {
    e.preventDefault();
    setInputError(null);
    const trimmed = multisigInput.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const pk = new PublicKey(trimmed);
      addToast("Opening multisig...", "info", 2000);
      router.push(`/cofre/${pk.toBase58()}`);
    } catch {
      setInputError("Invalid Solana address");
      addToast("Invalid Solana address", "error");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-100"
    >
      <BackgroundOrbs />

      {/* ═══════════ HEADER ═══════════ */}
      <header className="relative z-30 border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6"
        >
          <Link href="/" className="flex items-center gap-2.5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20"
            >
              <FeatureIcon name="shield" className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-lg font-bold tracking-tight">Cloak Squads</span>
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative z-10"
      >
        <div className="mx-auto max-w-7xl px-4 pt-20 pb-16 md:px-6 md:pt-28 md:pb-24"
        >
          <StaggerContainer className="mx-auto max-w-3xl text-center" staggerDelay={0.15}
          >
            <StaggerItem>
              <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-800/50 bg-emerald-950/30 px-4 py-1.5"
              >
                <span className="relative flex h-2 w-2"
                >
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-sm font-medium text-emerald-300">Devnet Live</span>
              </div>
            </StaggerItem>

            <StaggerItem>
              <h1 className="text-5xl font-bold tracking-tight text-neutral-50 md:text-7xl"
              >
                Private Multisig
                <br />
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent"
                >
                  Transactions
                </span>
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400 md:text-xl"
              >
                Zero-knowledge private execution for Squads vaults. Send, receive,
                and manage funds without revealing amounts or counterparties on-chain.
              </p>
            </StaggerItem>

            <StaggerItem>
              <div className="mx-auto mt-10 max-w-xl"
              >
                <form
                  onSubmit={onOpenMultisig}
                  className="flex flex-col gap-3 sm:flex-row sm:items-start"
                >
                  <div className="flex-1"
                  >
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
                      <p className="mt-2 text-left text-sm text-red-400">{inputError}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !multisigInput.trim()}
                    isLoading={isSubmitting}
                    size="lg"
                    className="shrink-0"
                  >
                    Open Cofre
                  </Button>
                </form>
                <p className="mt-3 text-xs text-neutral-500"
                >
                  Or{" "}
                  <Link href="/#create" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                  >
                    create a new multisig
                  </Link>{" "}
                  to get started.
                </p>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      <TrustBar />

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="relative z-10"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28"
        >
          <StaggerContainer staggerDelay={0.1}
          >
            <StaggerItem>
              <div className="mb-16 text-center"
              >
                <h2 className="text-3xl font-bold text-neutral-50 md:text-4xl"
                >
                  How it works
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-neutral-400"
                >
                  Three simple steps to private, auditable transactions with your
                  existing Squads setup.
                </p>
              </div>
            </StaggerItem>

            <div className="grid gap-6 md:grid-cols-3"
            >
              <StepCard
                number="1"
                icon="send"
                title="Prepare"
                description="Create a private transfer proposal inside your Squads vault. Set the amount, recipient stealth pubkey, and optional memo."

              />
              <StepCard
                number="2"
                icon="check"
                title="Approve"
                description="Multisig members review the proposal, verify the zero-knowledge commitment, and vote to approve or reject."

              />
              <StepCard
                number="3"
                icon="zap"
                title="Execute"
                description="The operator consumes the approved license and executes the private transfer on Cloak, shielding the transaction details."

              />
            </div>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section className="relative z-10 border-y border-neutral-800/50 bg-neutral-950/30"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28"
        >
          <StaggerContainer staggerDelay={0.1}
          >
            <StaggerItem>
              <div className="mb-16 text-center"
              >
                <h2 className="text-3xl font-bold text-neutral-50 md:text-4xl"
                >
                  Everything you need
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-neutral-400"
                >
                  Built for teams that demand both privacy and accountability.
                </p>
              </div>
            </StaggerItem>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              <FeatureCard
                icon="eye"
                title="Private Sends"
                description="Hide amounts and recipients on-chain using Cloak zero-knowledge proofs."
              />
              <FeatureCard
                icon="users"
                title="Payroll Batches"
                description="Process multi-recipient payroll in a single Squads proposal."
                tag="New"
              />
              <FeatureCard
                icon="file"
                title="Stealth Invoicing"
                description="Generate encrypted invoices with claim URLs for private withdrawals."
              />
              <FeatureCard
                icon="shield"
                title="Scoped Audit Links"
                description="Create time-bound, permissioned audit views for compliance."
              />
              <FeatureCard
                icon="repeat"
                title="Operator Flow"
                description="Separate operator wallet executes without signer private keys."
              />
              <FeatureCard
                icon="key"
                title="Commitment Checks"
                description="Verify on-chain commitments locally before signing anything."
              />
            </div>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section id="create" className="relative z-10"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28"
        >
          <StaggerContainer staggerDelay={0.1}
          >
            <StaggerItem>
              <div className="mx-auto max-w-4xl"
              >
                <div className="mb-10 text-center"
                >
                  <h2 className="text-3xl font-bold text-neutral-50"
                  >
                    Ready to go private?
                  </h2>
                  <p className="mt-4 text-neutral-400"
                  >
                    Connect your wallet and open an existing Squads multisig, or
                    create a new one in seconds.
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-start"
                >
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-6 shadow-xl backdrop-blur-sm"
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10"
                    >
                      <FeatureIcon name="send" className="h-5 w-5 text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-100"
                    >
                      Open an existing multisig
                    </h3>
                    <p className="mt-2 text-sm text-neutral-500"
                    >
                      Jump back to the address field and open any Squads multisig PDA.
                    </p>
                    <Button
                      size="lg"
                      variant="gradient"
                      className="mt-6 w-full"
                      onClick={() => {
                        const el = document.getElementById("hero-input");
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        el?.focus({ preventScroll: true });
                      }}
                    >
                      <FeatureIcon name="send" className="h-5 w-5 mr-2" />
                      Open a Multisig
                    </Button>

                    {!wallet.connected && (
                      <p className="mt-4 text-xs text-neutral-500"
                      >
                        You&apos;ll need a Solana wallet to interact with Cloak Squads.
                      </p>
                    )}
                  </div>

                  <CreateMultisigCard
                    onCreated={(multisigPda) => router.push(`/cofre/${multisigPda}`)}
                  />
                </div>

                <div className="mt-8 flex justify-center"
                >
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  >
                    Learn More
                  </Button>
                </div>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="relative z-10 border-t border-neutral-800/50"
      >
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6"
        >
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row"
          >
            <div className="flex items-center gap-2"
            >
              <FeatureIcon name="shield" className="h-5 w-5 text-emerald-500/60" />
              <span className="text-sm font-semibold text-neutral-400">Cloak Squads</span>
            </div>
            <p className="text-xs text-neutral-600"
            >
              Zero-knowledge private execution for Squads vaults.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

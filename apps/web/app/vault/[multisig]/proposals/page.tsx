"use client";

import { AnimatedCard, StaggerContainer, StaggerItem } from "@/components/ui/animations";
import { Spinner } from "@/components/ui/skeleton";
import { truncateAddress } from "@/lib/proposals";
import { lamportsToSol } from "@/lib/sol";
import { useProposalSummaries } from "@/lib/use-proposal-summaries";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { use, useMemo } from "react";

export default function ProposalsListPage({
  params,
}: {
  params: Promise<{ multisig: string }>;
}) {
  const { multisig } = use(params);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const { data: drafts = [], isLoading: loading } = useProposalSummaries(multisig);

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-xl border border-signal-danger/30 bg-signal-danger/15 p-6">
          <h1 className="text-xl font-semibold text-ink">Invalid multisig address</h1>
          <p className="mt-1 text-sm text-ink-muted">Check the address and try again.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-bg via-bg to-surface">
      <section className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
        <StaggerContainer staggerDelay={0.1}>
          <StaggerItem>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-ink md:text-3xl tracking-tight">Proposals</h1>
              <p className="mt-1 text-sm text-ink-muted">
                All proposal drafts for {truncateAddress(multisigAddress.toBase58())}
              </p>
            </div>
          </StaggerItem>

          <StaggerItem>
            <AnimatedCard className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm shadow-raise-1 overflow-hidden">
              <div className="border-b border-border/50 p-4 bg-bg/30 flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">Recent proposals</h2>
                {drafts.length > 0 && (
                  <span className="text-xs text-ink-subtle">{drafts.length} total</span>
                )}
              </div>
              <div className="p-4 text-sm">
                {loading ? (
                  <div className="flex items-center gap-3 text-ink-muted">
                    <Spinner size="sm" />
                    <span>Loading proposals...</span>
                  </div>
                ) : drafts.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 mx-auto mb-3">
                      <svg
                        aria-hidden="true"
                        className="h-6 w-6 text-ink-subtle"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-ink-muted">No proposal drafts yet</p>
                    <p className="text-xs text-ink-subtle mt-1">Create one from the Send page</p>
                  </div>
                ) : (
                  <ul className="grid gap-2">
                    {drafts.map((d) => (
                      <li key={d.id}>
                        <Link
                          href={`/vault/${multisig}/proposals/${d.transactionIndex}`}
                          className="flex items-center justify-between rounded-lg border border-border/50 p-4 transition-all duration-200 hover:border-emerald-900/50 hover:bg-surface-2/50 group"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-sm text-ink flex items-center gap-2">
                              <span className="text-accent">#{d.transactionIndex}</span>
                              {d.type === "payroll" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft/50 px-2.5 py-0.5 text-xs text-accent border border-accent/20/30">
                                  <svg
                                    aria-hidden="true"
                                    className="h-3 w-3"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                    />
                                  </svg>
                                  payroll
                                </span>
                              )}
                              {d.status && (
                                <span className="inline-flex rounded-full border border-border-strong bg-surface-2 px-2.5 py-0.5 text-xs text-ink-muted">
                                  {d.status}
                                </span>
                              )}
                            </p>
                            <p className="mt-1.5 text-xs text-ink-muted">
                              {d.type === "onchain"
                                ? `${d.approvals ?? 0}/${d.threshold ?? "?"} approvals`
                                : d.type === "payroll"
                                  ? `${d.recipientCount} recipients, ${lamportsToSol(d.totalAmount ?? d.amount)} SOL total`
                                  : `${lamportsToSol(d.amount)} SOL → ${truncateAddress(d.recipient)}`}
                            </p>
                          </div>
                          <span className="text-xs text-ink-subtle shrink-0 ml-4">
                            {new Date(d.createdAt).toLocaleDateString()}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </AnimatedCard>
          </StaggerItem>
        </StaggerContainer>
      </section>
    </main>
  );
}

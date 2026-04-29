"use client";

import { Button } from "@/components/ui/button";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { lamportsToSol } from "@/lib/sol";
import { statusBadge, statusLabel } from "@/lib/status-labels";
import {
  CLOAK_PROGRAM_ID,
  computeUtxoCommitment,
  createUtxo,
  derivePublicKey,
  fullWithdraw,
} from "@cloak.dev/sdk-devnet";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { use, useEffect, useState } from "react";

type StealthInvoice = {
  id: string;
  cofreAddress: string;
  recipientWallet: string;
  invoiceRef: string | null;
  memo: string | null;
  stealthPubkey: string;
  amountHint: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  // UTXO data for claim
  utxoAmount: string | null;
  utxoPrivateKey: string | null;
  utxoPublicKey: string | null;
  utxoBlinding: string | null;
  utxoMint: string | null;
  utxoLeafIndex: number | null;
  utxoCommitment: string | null;
};

type ClaimState = "loading" | "invalid" | "expired" | "claimed" | "voided" | "ready";

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function base64urlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function ClaimPage({ params }: { params: Promise<{ stealthId: string }> }) {
  const { stealthId } = use(params);
  const { connection } = useConnection();
  const wallet = useWallet();

  const [invoice, setInvoice] = useState<StealthInvoice | null>(null);
  const [claimState, setClaimState] = useState<ClaimState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once on mount; window.location is not reactive
  useEffect(() => {
    if (typeof window === "undefined") return;

    const fragment = window.location.hash.slice(1);
    if (!fragment) {
      setError("Missing access key in URL. Make sure you have the complete link with #fragment.");
      setClaimState("invalid");
      return;
    }

    const params = new URLSearchParams(fragment);
    const version = params.get("v");
    const sk = params.get("sk");
    const vault = params.get("vault") ?? params.get("cofre"); // support both for backward compat

    if (version !== "1" || !sk || !vault) {
      setError("Invalid URL format. The link may be corrupted or incomplete.");
      setClaimState("invalid");
      return;
    }

    try {
      const secretKeyBytes = base64urlDecode(sk);
      if (secretKeyBytes.length !== 32) {
        setError("Invalid secret key length.");
        setClaimState("invalid");
        return;
      }

      new PublicKey(vault); // validate vault address
      setSecretKey(secretKeyBytes);
    } catch {
      setError("Invalid secret key or vault address.");
      setClaimState("invalid");
      return;
    }
  }, [stealthId]);

  // Load invoice data
  useEffect(() => {
    if (!secretKey) return;

    const loadInvoice = async () => {
      try {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const vault = params.get("vault") ?? params.get("cofre"); // support both for backward compat
        if (!vault) {
          setError("Missing vault address in URL.");
          setClaimState("invalid");
          return;
        }

        const res = await fetch(`/api/stealth/${encodeURIComponent(vault)}`);
        if (!res.ok) {
          setError("Failed to load invoice data.");
          setClaimState("invalid");
          return;
        }

        const invoices = (await res.json()) as StealthInvoice[];
        const found = invoices.find((inv) => inv.id === stealthId);

        if (!found) {
          setError("Invoice not found.");
          setClaimState("invalid");
          return;
        }

        if (found.status === "claimed") {
          setInvoice(found);
          setClaimState("claimed");
          return;
        }

        if (found.status === "voided") {
          setInvoice(found);
          setClaimState("voided");
          return;
        }

        if (new Date(found.expiresAt) < new Date()) {
          setInvoice(found);
          setClaimState("expired");
          return;
        }

        setInvoice(found);
        setClaimState("ready");
      } catch {
        setError("Failed to load invoice data.");
        setClaimState("invalid");
      }
    };

    void loadInvoice();
  }, [stealthId, secretKey]);

  const handleClaim = async () => {
    if (!invoice || !wallet.publicKey) return;

    setClaiming(true);
    setError(null);

    try {
      // Check if UTXO data is available for real claim
      if (
        invoice.utxoAmount &&
        invoice.utxoPrivateKey &&
        invoice.utxoBlinding &&
        invoice.utxoMint &&
        invoice.utxoCommitment
      ) {
        // Reconstruct UTXO for fullWithdraw.
        // The stored privateKey is the raw field element from generateUtxoKeypair(),
        // NOT a wallet spend key — so we derive the publicKey directly instead of
        // using deriveUtxoKeypairFromSpendKey (which applies a blake3 domain-hash).
        const privateKey = BigInt(`0x${invoice.utxoPrivateKey.padStart(64, "0")}`);
        const publicKey = await derivePublicKey(privateKey);
        const keypair = { privateKey, publicKey };
        const mint = new PublicKey(invoice.utxoMint);
        const amount = BigInt(invoice.utxoAmount);
        const utxo = await createUtxo(amount, keypair, mint);
        utxo.blinding = BigInt(`0x${invoice.utxoBlinding}`);
        utxo.commitment = await computeUtxoCommitment(utxo);
        if (invoice.utxoLeafIndex !== null) {
          utxo.index = invoice.utxoLeafIndex;
        }

        const result = await fullWithdraw([utxo], wallet.publicKey, {
          connection,
          programId: CLOAK_PROGRAM_ID,
          relayUrl: "https://api.devnet.cloak.ag",
          signTransaction: wallet.signTransaction,
          ...(wallet.signMessage ? { signMessage: wallet.signMessage } : {}),
          depositorPublicKey: wallet.publicKey,
          onProgress: (s: string) => console.error(`[cloak-claim] ${s}`),
          onProofProgress: (p: number) => console.error(`[cloak-claim] proof ${p}%`),
        } as Parameters<typeof fullWithdraw>[2]);

        console.log("Claim tx:", result.signature);
      }

      // Call API to mark invoice as claimed
      const response = await fetch(`/api/stealth/${invoice.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimedBy: wallet.publicKey.toBase58() }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to claim invoice");
      }

      setClaimState("claimed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Claim failed.");
    } finally {
      setClaiming(false);
    }
  };

  const getStateMessage = () => {
    switch (claimState) {
      case "loading":
        return "Carregando dados do invoice...";
      case "invalid":
        return "Link inválido ou corrompido";
      case "expired":
        return "Este invoice expirou";
      case "claimed":
        return "Este invoice já foi resgatado";
      case "voided":
        return "Este invoice foi anulado";
      case "ready":
        return "Pronto para resgate";
    }
  };

  const getStateColor = () => {
    switch (claimState) {
      case "loading":
        return "text-ink-muted";
      case "invalid":
      case "expired":
      case "voided":
        return "text-red-200";
      case "claimed":
        return "text-accent";
      case "ready":
        return "text-accent";
    }
  };

  if (claimState === "loading") {
    return (
      <main className="min-h-screen bg-bg">
        <header className="border-b border-border bg-bg/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Aegis
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-ink-muted">Loading invoice data...</p>
        </section>
      </main>
    );
  }

  if (claimState === "invalid") {
    return (
      <main className="min-h-screen bg-bg">
        <header className="border-b border-border bg-bg/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Aegis
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-8">
            <h1 className="text-xl font-semibold text-red-200">Erro de Acesso</h1>
            <p className="mt-4 text-neutral-300">{error ?? "Invalid or corrupted link."}</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-surface-2 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-surface-3"
            >
              Return Home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="rounded-md text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Aegis
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-accent">Resgate de Pagamento</p>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(claimState).bg} ${statusBadge(claimState).text}`}
              >
                {statusLabel(claimState).label}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Resgatar Invoice</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">{getStateMessage()}</p>
          </div>

          {invoice ? (
            <div className="flex flex-col gap-2 text-right">
              <p className="text-sm text-ink-subtle">
                Cofre: {truncateAddress(invoice.cofreAddress)}
              </p>
              <p className="text-sm text-ink-subtle">
                Criado: {new Date(invoice.createdAt).toLocaleDateString()}
              </p>
              <p className="text-sm text-ink-subtle">
                Expira: {new Date(invoice.expiresAt).toLocaleDateString()}
              </p>
            </div>
          ) : null}
        </div>

        {invoice ? (
          <>
            <section className="mt-8 rounded-lg border border-border bg-surface p-6">
              <h3 className="font-semibold text-ink">Detalhes do Invoice</h3>
              <dl className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink-subtle">Invoice ID</dt>
                  <dd className="mt-1 font-mono text-sm text-neutral-300">{invoice.id}</dd>
                </div>
                {invoice.invoiceRef ? (
                  <div>
                    <dt className="text-xs text-ink-subtle">Referência</dt>
                    <dd className="mt-1 text-sm text-neutral-300">{invoice.invoiceRef}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-ink-subtle">Valor</dt>
                  <dd className="mt-1 font-mono text-sm text-neutral-300">
                    {invoice.amountHint ? `${lamportsToSol(invoice.amountHint)} SOL` : "Hidden"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-subtle">Chave do Destinatário</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-neutral-300">
                    {invoice.stealthPubkey}
                  </dd>
                </div>
                {invoice.memo ? (
                  <div className="md:col-span-2">
                    <dt className="text-xs text-ink-subtle">Mensagem</dt>
                    <dd className="mt-1 text-sm text-neutral-300">{invoice.memo}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {claimState === "ready" ? (
              <section className="mt-8 rounded-lg border border-border bg-surface p-6">
                <h3 className="font-semibold text-ink">Resgatar Fundos</h3>
                <p className="mt-2 text-sm text-neutral-300">
                  Conecte sua wallet e clique no botão abaixo para resgatar os fundos.
                </p>

                {!wallet.publicKey ? (
                  <p className="mt-4 text-sm text-amber-300">Conecte sua wallet para continuar.</p>
                ) : invoice.recipientWallet !== wallet.publicKey.toBase58() ? (
                  <div className="mt-4 rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
                    <p className="font-medium">Wallet incorreta</p>
                    <p className="mt-1 text-xs text-signal-danger">
                      Este invoice foi criado para a wallet{" "}
                      <span className="font-mono">{truncateAddress(invoice.recipientWallet)}</span>.
                      Conecte essa wallet para resgatar.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4">
                    <p className="mb-3 text-sm text-accent">Wallet correta conectada ✓</p>
                    <Button onClick={handleClaim} disabled={claiming}>
                      {claiming ? "Processando resgate..." : "Resgatar fundos"}
                    </Button>
                  </div>
                )}

                {error ? (
                  <p className="mt-4 rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
                    {error}
                  </p>
                ) : null}
              </section>
            ) : (
              <section className="mt-8 rounded-lg border border-border bg-surface p-6 text-center">
                <p className={`text-lg font-medium ${getStateColor()}`}>{getStateMessage()}</p>
                {claimState === "expired" ? (
                  <p className="mt-2 text-sm text-ink-muted">
                    Este invoice expirou em {new Date(invoice.expiresAt).toLocaleString()}.
                  </p>
                ) : null}
                <Link
                  href="/"
                  className="mt-4 inline-block rounded-md bg-surface-2 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-surface-3"
                >
                  Voltar para Home
                </Link>
              </section>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}

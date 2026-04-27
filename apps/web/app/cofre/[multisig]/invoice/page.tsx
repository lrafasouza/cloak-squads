"use client";

import { PublicKey } from "@solana/web3.js";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import Link from "next/link";
import { type FormEvent, use, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InvoicePage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [recipientWallet, setRecipientWallet] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ id: string; stealthPubkey: string; claimUrl: string } | null>(null);

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setPending(true);

    try {
      if (!multisigAddress) {
        throw new Error("Invalid multisig address.");
      }

      if (!/^[0-9]+$/.test(amount) || BigInt(amount) <= 0n) {
        throw new Error("Amount must be a positive integer in lamports.");
      }

      const recipientPubkey = new PublicKey(recipientWallet.trim());

      const body = {
        cofreAddress: multisigAddress.toBase58(),
        invoiceRef: invoiceRef.trim() || undefined,
        memo: memo.trim() || undefined,
        amount,
        recipientWallet: recipientPubkey.toBase58(),
      };

      const res = await fetch("/api/stealth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to create stealth invoice.");
      }

      const data = (await res.json()) as { id: string; stealthPubkey: string; claimUrl: string };
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create stealth invoice.");
    } finally {
      setPending(false);
    }
  }

  const handleCopy = async () => {
    if (!result) return;
    const fullUrl = `${window.location.origin}${result.claimUrl}`;
    await navigator.clipboard.writeText(fullUrl);
  };

  if (!multisigAddress) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-emerald-300">
          Back to picker
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-neutral-50">Invalid multisig address</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href={`/cofre/${multisigAddress.toBase58()}`} className="text-sm font-semibold text-neutral-100">
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-emerald-300">F4 stealth invoicing</p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Create stealth invoice</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Generate an encrypted invoice with a unique claim URL. The recipient uses the URL
            fragment to access and withdraw the funds privately.
          </p>
        </div>

        <div className="grid gap-4">
          <form onSubmit={createInvoice} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 md:p-5">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="invoiceRef">Invoice reference</Label>
                <Input
                  id="invoiceRef"
                  type="text"
                  autoComplete="off"
                  value={invoiceRef}
                  onChange={(event) => setInvoiceRef(event.target.value)}
                  placeholder="Optional reference number"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="memo">Memo</Label>
                <Input
                  id="memo"
                  type="text"
                  autoComplete="off"
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="Optional description"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="amount">Amount in lamports</Label>
                <Input
                  id="amount"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="1000000"
                  className="mt-1 font-mono"
                />
              </div>

              <div>
                <Label htmlFor="recipient">Recipient wallet</Label>
                <Input
                  id="recipient"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={recipientWallet}
                  onChange={(event) => setRecipientWallet(event.target.value)}
                  placeholder="Solana wallet address"
                  className="mt-1 font-mono"
                />
              </div>

              <Button type="submit" disabled={pending}>
                {pending ? "Creating invoice..." : "Create stealth invoice"}
              </Button>
            </div>

            {error ? (
              <p className="mt-4 rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
                {error}
              </p>
            ) : null}
          </form>

          {result ? (
            <div className="rounded-lg border border-emerald-900 bg-emerald-950 p-4">
              <p className="text-sm font-medium text-emerald-200">Invoice created successfully</p>
              <div className="mt-3 space-y-2">
                <div>
                  <p className="text-xs text-emerald-300">Stealth pubkey</p>
                  <p className="break-all font-mono text-xs text-emerald-100">{result.stealthPubkey}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-300">Claim URL</p>
                  <p className="break-all font-mono text-xs text-emerald-100">
                    {`${typeof window !== "undefined" ? window.location.origin : ""}${result.claimUrl}`}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  Copy claim URL
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

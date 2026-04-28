"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import { buildIssueLicenseIxBrowser } from "@/lib/gatekeeper-instructions";
import {
  type PayrollRecipientInput,
  formatPayrollCsvTemplate,
  parsePayrollCsv,
} from "@/lib/payroll-csv";
import { createBatchIssueLicenseProposal } from "@/lib/squads-sdk";
import { computePayloadHash } from "@cloak-squads/core/hashing";
import type { PayloadInvariants } from "@cloak-squads/core/types";
import {
  NATIVE_SOL_MINT,
  computeUtxoCommitment,
  createUtxo,
  generateUtxoKeypair,
} from "@cloak.dev/sdk-devnet";
import { lamportsToSol } from "@/lib/sol";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, use, useMemo, useState } from "react";

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hexToBytes(hex: string) {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

type RecipientNote = {
  name: string;
  wallet: string;
  amount: string;
  memo: string | undefined;
  note: {
    commitment: string;
    keypairPrivateKey: string;
    keypairPublicKey: string;
    blinding: string;
    tokenMint: string;
  };
  invariants: PayloadInvariants;
  hash: Uint8Array;
  instruction: Awaited<ReturnType<typeof buildIssueLicenseIxBrowser>>["instruction"];
  claim: {
    amount: number | string;
    keypairPrivateKey: string;
    keypairPublicKey: string;
    blinding: string;
    commitment: string;
    recipient_vk: string;
    token_mint: string;
  };
};

export default function PayrollPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();

  const [csvText, setCsvText] = useState("");
  const [recipients, setRecipients] = useState<PayrollRecipientInput[]>([]);
  const [parsedNotes, setParsedNotes] = useState<RecipientNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "submitting">("upload");

  const multisigAddress = useMemo(() => {
    try {
      return new PublicKey(multisig);
    } catch {
      return null;
    }
  }, [multisig]);

  const totalAmount = useMemo(() => {
    return recipients.reduce((sum, r) => sum + BigInt(r.amount), 0n);
  }, [recipients]);

  function handleCsvChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    setCsvText(text);
    setError(null);
    setRecipients([]);
    setParsedNotes([]);
    setStep("upload");

    if (!text.trim()) return;

    const { data, errors } = parsePayrollCsv(text);
    if (errors.length > 0 && !data) {
      setError(errors.join("\n"));
      return;
    }
    if (data) {
      setRecipients(data);
      if (errors.length > 0) {
        setError(errors.join("\n"));
      }
    }
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      handleCsvChange({ target: { value: text } } as ChangeEvent<HTMLTextAreaElement>);
    };
    reader.readAsText(file);
  }

  async function buildNotes() {
    if (!multisigAddress) return;
    setError(null);
    setStep("preview");

    try {
      const notes: RecipientNote[] = [];
      for (const recipient of recipients) {
        const recipientPubkey = new PublicKey(recipient.wallet);

        // Generate real Cloak UTXO commitment
        const keypair = await generateUtxoKeypair();
        const mint = NATIVE_SOL_MINT;
        const utxo = await createUtxo(BigInt(recipient.amount), keypair, mint);
        const commitmentBigInt = await computeUtxoCommitment(utxo);
        const commitment = commitmentBigInt.toString(16).padStart(64, "0");

        const note = {
          commitment,
          keypairPrivateKey: keypair.privateKey.toString(16).padStart(64, "0"),
          keypairPublicKey: keypair.publicKey.toString(16).padStart(64, "0"),
          blinding: utxo.blinding.toString(16).padStart(64, "0"),
          tokenMint: mint.toBase58(),
        };
        const invariants: PayloadInvariants = {
          nullifier: randomBytes(32),
          commitment: hexToBytes(note.commitment),
          amount: BigInt(recipient.amount),
          tokenMint: mint,
          recipientVkPub: recipientPubkey.toBytes(),
          nonce: randomBytes(16),
        };

        const hash = computePayloadHash(invariants);
        const { instruction } = await buildIssueLicenseIxBrowser({
          multisig: multisigAddress,
          payloadHash: hash,
          nonce: invariants.nonce,
        });

        notes.push({
          name: recipient.name,
          wallet: recipient.wallet,
          amount: recipient.amount,
          memo: recipient.memo,
          note,
          invariants,
          hash,
          instruction,
          claim: {
            amount: invariants.amount.toString(),
            keypairPrivateKey: note.keypairPrivateKey,
            keypairPublicKey: note.keypairPublicKey,
            blinding: note.blinding,
            commitment: note.commitment,
            recipient_vk: recipientPubkey.toBase58(),
            token_mint: mint.toBase58(),
          },
        });
      }
      setParsedNotes(notes);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not build notes.");
      setStep("upload");
    }
  }

  async function submitPayroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      if (!wallet.publicKey || !multisigAddress) {
        throw new Error("Connect a wallet and open a valid multisig.");
      }

      if (parsedNotes.length === 0) {
        throw new Error("No recipients prepared. Build notes first.");
      }

      const instructions = parsedNotes.map((n) => n.instruction);
      const result = await createBatchIssueLicenseProposal({
        connection,
        wallet,
        multisigPda: multisigAddress,
        issueLicenseIxs: instructions,
        memo: `payroll batch (${parsedNotes.length} recipients)`,
      });

      const transactionIndex = result.transactionIndex.toString();
      const totalAmountStr = totalAmount.toString();

      // Persist payroll draft
      const draftPayload = {
        cofreAddress: multisigAddress.toBase58(),
        transactionIndex,
        memo: `payroll batch (${parsedNotes.length} recipients)`,
        totalAmount: totalAmountStr,
        recipients: parsedNotes.map((n) => ({
          name: n.name,
          wallet: n.wallet,
          amount: n.amount,
          memo: n.memo,
          payloadHash: Array.from(n.hash),
          invariants: {
            nullifier: Array.from(n.invariants.nullifier),
            commitment: Array.from(n.invariants.commitment),
            amount: n.invariants.amount.toString(),
            tokenMint: n.invariants.tokenMint.toBase58(),
            recipientVkPub: Array.from(n.invariants.recipientVkPub),
            nonce: Array.from(n.invariants.nonce),
          },
          commitmentClaim: n.claim,
          signature: result.signature,
        })),
      };

      const draftResponse = await fetch("/api/payrolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload),
      });

      if (!draftResponse.ok) {
        const body = (await draftResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not persist payroll draft.");
      }

      // Store claims in sessionStorage
      for (let i = 0; i < parsedNotes.length; i++) {
        const n = parsedNotes[i]!;
        try {
          sessionStorage.setItem(
            `claim:${multisigAddress.toBase58()}:${transactionIndex}:${i}`,
            JSON.stringify(n.claim),
          );
        } catch {
          /* sessionStorage full or unavailable */
        }
      }

      router.push(`/cofre/${multisigAddress.toBase58()}/proposals/${transactionIndex}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create payroll proposal.");
      setPending(false);
    }
  }

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
          <Link
            href={`/cofre/${multisigAddress.toBase58()}`}
            className="text-sm font-semibold text-neutral-100"
          >
            Cofre
          </Link>
          <ClientWalletButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6">
        <div>
          <p className="text-sm font-medium text-emerald-300">F2 payroll</p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-50">Batch private send</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Upload a CSV with recipient names, wallet addresses, and amounts. One Squads proposal
            will contain all {recipients.length > 0 && `(${recipients.length}) `}private transfer
            instructions for signer approval.
          </p>
          <p className="mt-3 text-xs text-neutral-400">Max 10 recipients per batch in V1.</p>
        </div>

        <div className="grid gap-4">
          {step === "upload" && (
            <div className="grid gap-4">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 md:p-5">
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="csv-file">Upload CSV file</Label>
                    <Input
                      id="csv-file"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileUpload}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="csv-text">Or paste CSV content</Label>
                    <textarea
                      id="csv-text"
                      value={csvText}
                      onChange={handleCsvChange}
                      placeholder={formatPayrollCsvTemplate()}
                      rows={6}
                      className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    />
                  </div>

                  {recipients.length > 0 && (
                    <Button onClick={buildNotes} disabled={pending}>
                      Preview {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}
                    </Button>
                  )}
                </div>

                {error ? (
                  <pre className="mt-4 rounded-md border border-red-900 bg-red-950 p-3 text-xs text-red-200 whitespace-pre-wrap">
                    {error}
                  </pre>
                ) : null}
              </div>
            </div>
          )}

          {step === "preview" && parsedNotes.length > 0 && (
            <form onSubmit={submitPayroll} className="grid gap-4">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <h2 className="text-base font-semibold text-neutral-50">Preview</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-800 text-left">
                        <th className="pb-2 pr-4 text-neutral-400">Name</th>
                        <th className="pb-2 pr-4 text-neutral-400">Wallet</th>
                        <th className="pb-2 pr-4 text-neutral-400 text-right">Amount</th>
                        <th className="pb-2 text-neutral-400">Memo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {parsedNotes.map((n, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-4 text-neutral-100">{n.name}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-neutral-300">
                            {n.wallet.slice(0, 8)}...{n.wallet.slice(-8)}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-neutral-100">
                            {lamportsToSol(n.amount)} SOL
                          </td>
                          <td className="py-2 text-neutral-400">{n.memo || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-neutral-700 font-semibold">
                        <td colSpan={2} className="py-2 pr-4 text-neutral-100">
                          Total
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-emerald-300">
                          {lamportsToSol(totalAmount)} SOL
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-neutral-400">
                  <span>Recipients: {parsedNotes.length}/10</span>
                  <span>Fee estimate: ~{(parsedNotes.length * 0.000005).toFixed(6)} SOL</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep("upload");
                    setParsedNotes([]);
                  }}
                  disabled={pending}
                >
                  Back
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating proposal..." : "Create payroll proposal"}
                </Button>
              </div>

              {error ? (
                <p className="rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

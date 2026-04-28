"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { type FormEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { AnimatedCard, StaggerContainer, StaggerItem } from "@/components/ui/animations";


const { Permission, Permissions } = multisig.types;

type CreateState = "idle" | "pending" | "success" | "error";

export function CreateMultisigCard({
  onCreated,
}: {
  onCreated: (multisigPda: string) => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { addToast } = useToast();
  const [threshold, setThreshold] = useState(1);
  const [memberInputs, setMemberInputs] = useState<string[]>([""]);
  const [state, setState] = useState<CreateState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [createdPda, setCreatedPda] = useState<string | null>(null);

  const addMember = useCallback(() => {
    if (memberInputs.length >= 10) {
      addToast("Maximum 10 members allowed", "warning");
      return;
    }
    setMemberInputs((prev) => [...prev, ""]);
  }, [memberInputs.length, addToast]);

  const removeMember = useCallback((index: number) => {
    setMemberInputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateMember = useCallback((index: number, value: string) => {
    setMemberInputs((prev) => prev.map((m, i) => (i === index ? value : m)));
  }, []);

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!wallet.publicKey || !wallet.sendTransaction) return;

      setState("pending");
      setError(null);
      addToast("Creating multisig...", "info");

      try {
        const createKey = Keypair.generate();
        const [multisigPda] = multisig.getMultisigPda({
          createKey: createKey.publicKey,
        });

        const [programConfigPda] = multisig.getProgramConfigPda({});
        const programConfig =
          await multisig.accounts.ProgramConfig.fromAccountAddress(
            connection,
            programConfigPda,
          );
        const treasury = programConfig.treasury;

        const parsedMembers = memberInputs
          .map((m) => m.trim())
          .filter(Boolean)
          .map((addr) => {
            try {
              return new PublicKey(addr);
            } catch {
              throw new Error(`Invalid member address: ${addr}`);
            }
          });

        const uniqueMembers = [
          ...new Set([...parsedMembers, wallet.publicKey].map((k) => k.toBase58())),
        ].map((addr) => new PublicKey(addr));

        if (threshold < 1 || threshold > uniqueMembers.length) {
          throw new Error(
            `Threshold must be between 1 and ${uniqueMembers.length}`,
          );
        }

        const memberPermissions = Permissions.fromPermissions([
          Permission.Initiate,
          Permission.Vote,
          Permission.Execute,
        ]);

        const createIx = multisig.instructions.multisigCreateV2({
          treasury,
          createKey: createKey.publicKey,
          creator: wallet.publicKey,
          multisigPda,
          configAuthority: null,
          threshold,
          members: uniqueMembers.map((key) => ({
            key,
            permissions: memberPermissions,
          })),
          timeLock: 0,
          rentCollector: null,
          memo: "Created via Cloak Squads",
        });

        const latestBlockhash = await connection.getLatestBlockhash();
        const tx = new Transaction().add(createIx);
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = latestBlockhash.blockhash;
        tx.partialSign(createKey);

        const signature = await wallet.sendTransaction(tx, connection);
        await connection.confirmTransaction(
          { signature, ...latestBlockhash },
          "confirmed",
        );

        setCreatedPda(multisigPda.toBase58());
        setState("success");
        addToast("Multisig created successfully!", "success");
        onCreated(multisigPda.toBase58());
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create multisig";
        setError(message);
        setState("error");
        addToast(message, "error");
      }
    },
    [wallet, connection, memberInputs, threshold, onCreated, addToast],
  );

  const walletConnected = wallet.connected && !!wallet.publicKey && !!wallet.sendTransaction;

  return (
    <AnimatedCard>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">
              Create a new multisig
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {walletConnected
                ? "Add members and set the approval threshold."
                : "Connect your wallet to create a multisig."}
            </p>
          </div>
        </div>

        {!walletConnected ? (
          <div className="mt-4 space-y-3">
            {[
              { step: "1", text: "Connect your wallet above", icon: "wallet" },
              { step: "2", text: "Define members and threshold", icon: "users" },
              { step: "3", text: "Create and open your multisig", icon: "check" },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3 rounded-lg border border-neutral-800/50 bg-neutral-950/50 px-4 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-400">
                  {item.step}
                </div>
                <span className="text-sm text-neutral-500">{item.text}</span>
              </div>
            ))}
          </div>
        ) : state === "success" && createdPda ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-semibold text-emerald-300">Multisig created successfully!</span>
              </div>
              <p className="font-mono text-xs text-neutral-400 break-all bg-neutral-950/50 rounded-lg px-3 py-2">
                {createdPda}
              </p>
            </div>
            <Button onClick={() => onCreated(createdPda)} size="sm" className="w-full">
              Open multisig
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-5">
            <div>
              <label className="text-sm font-medium text-neutral-300 mb-2 block">
                Members
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                Your wallet is automatically included as a member.
              </p>
              <StaggerContainer className="space-y-2" staggerDelay={0.05}>
                {memberInputs.map((value, i) => (
                  <StaggerItem key={i}>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={value}
                        onChange={(e) => updateMember(i, e.target.value)}
                        placeholder={
                          i === 0
                            ? "Additional member pubkey (optional)"
                            : "Member pubkey"
                        }
                        className="flex-1 font-mono text-xs"
                      />
                      {memberInputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMember(i)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-900/50 text-red-400 hover:bg-red-950/30 transition-colors"
                          title="Remove member"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>
              <button
                type="button"
                onClick={addMember}
                className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add member ({memberInputs.length}/10)
              </button>
            </div>

            <div>
              <label
                htmlFor="threshold"
                className="text-sm font-medium text-neutral-300 mb-2 block"
              >
                Approval threshold
              </label>
              <Input
                id="threshold"
                type="number"
                min={1}
                max={memberInputs.filter((m) => m.trim()).length + 1 || 10}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-24"
              />
              <p className="mt-2 text-xs text-neutral-500">
                How many members must approve a proposal.
              </p>
            </div>

            <Button
              type="submit"
              disabled={state === "pending" || !walletConnected}
              isLoading={state === "pending"}
              className="w-full"
            >
              {state === "pending" ? "Creating multisig..." : "Create multisig"}
            </Button>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3">
                <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </form>
        )}
      </div>
    </AnimatedCard>
  );
}

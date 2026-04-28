"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { type FormEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

const { Permission, Permissions } = multisig.types;

type CreateState = "idle" | "pending" | "success" | "error";

export function CreateMultisigCard({
  onCreated,
}: {
  onCreated: (multisigPda: string) => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [threshold, setThreshold] = useState(1);
  const [memberInputs, setMemberInputs] = useState<string[]>([""]);
  const [state, setState] = useState<CreateState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [createdPda, setCreatedPda] = useState<string | null>(null);

  const addMember = useCallback(() => {
    setMemberInputs((prev) => [...prev, ""]);
  }, []);

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
        onCreated(multisigPda.toBase58());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create multisig");
        setState("error");
      }
    },
    [wallet, connection, memberInputs, threshold, onCreated],
  );

  const walletConnected = wallet.connected && !!wallet.publicKey && !!wallet.sendTransaction;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="text-sm font-semibold text-neutral-100">
        Create a new multisig
      </h2>
      <p className="mt-1 text-sm text-neutral-400">
        {walletConnected
          ? "Add members and set the approval threshold."
          : "Connect your wallet to create a multisig."}
      </p>

      {!walletConnected ? (
        <div className="mt-4 space-y-2 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="text-neutral-600">1.</span>
            <span>Connect your wallet above</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-600">2.</span>
            <span>Define members and threshold</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-600">3.</span>
            <span>Create and open your multisig</span>
          </div>
        </div>
      ) : state === "success" && createdPda ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-emerald-300">
            Multisig created successfully!
          </p>
          <p className="font-mono text-xs text-neutral-400 break-all">
            {createdPda}
          </p>
          <Button onClick={() => onCreated(createdPda)} size="sm">
            Open multisig
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-300">
              Members
            </label>
            <p className="mt-0.5 mb-2 text-xs text-neutral-500">
              Your wallet is automatically included as a member.
            </p>
            {memberInputs.map((value, i) => (
              <div key={i} className="mt-2 flex gap-2">
                <input
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
                  className="min-h-9 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-xs text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                />
                {memberInputs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMember(i)}
                    className="rounded-md border border-neutral-700 px-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addMember}
              className="mt-2 text-xs text-emerald-300 hover:text-emerald-200"
            >
              + Add member
            </button>
          </div>

          <div>
            <label
              htmlFor="threshold"
              className="text-sm font-medium text-neutral-300"
            >
              Approval threshold
            </label>
            <input
              id="threshold"
              type="number"
              min={1}
              max={memberInputs.filter((m) => m.trim()).length + 1 || 10}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-1 block w-20 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            />
            <p className="mt-1 text-xs text-neutral-500">
              How many members must approve a proposal.
            </p>
          </div>

          <Button
            type="submit"
            disabled={state === "pending" || !walletConnected}
            className="w-full"
          >
            {state === "pending" ? "Creating multisig..." : "Create multisig"}
          </Button>

          {error && <p className="text-sm text-red-300">{error}</p>}
        </form>
      )}
    </div>
  );
}

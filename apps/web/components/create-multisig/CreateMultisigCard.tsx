"use client";

import { AnimatedCard, StaggerContainer, StaggerItem } from "@/components/ui/animations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { buildInitCofreIxBrowser } from "@/lib/gatekeeper-instructions";
import {
  createInitCofreProposal,
  proposalApprove,
  vaultTransactionExecute,
} from "@/lib/squads-sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

const { Permission, Permissions } = multisig.types;

type CreateState = "idle" | "pending" | "success" | "error";
type BootstrapState = "idle" | "proposal-created" | "initialized" | "error";
const OPERATOR_PREFERENCE_KEY = "cloak-squads:operator-wallet";
const OPERATOR_PLACEHOLDER = "7QqJ4Q5j9V7qgR3Qm2Yf6sY2VxK8gTq8nWvM9pL4cZ2A";

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
  const [operatorInput, setOperatorInput] = useState("");
  const [state, setState] = useState<CreateState>("idle");
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>("idle");
  const [bootstrapProposalIndex, setBootstrapProposalIndex] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdPda, setCreatedPda] = useState<string | null>(null);
  const [createdOperator, setCreatedOperator] = useState<string | null>(null);
  const operatorInitializedRef = useRef(false);

  useEffect(() => {
    if (!wallet.publicKey || operatorInitializedRef.current) return;

    const savedOperator =
      typeof window === "undefined" ? null : localStorage.getItem(OPERATOR_PREFERENCE_KEY);
    setOperatorInput(savedOperator?.trim() || wallet.publicKey.toBase58());
    operatorInitializedRef.current = true;
  }, [wallet.publicKey]);

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
      setBootstrapState("idle");
      setBootstrapProposalIndex(null);
      setError(null);
      addToast("Creating multisig...", "info");

      try {
        const operator = new PublicKey(operatorInput.trim());
        const createKey = Keypair.generate();
        const [multisigPda] = multisig.getMultisigPda({
          createKey: createKey.publicKey,
        });
        const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

        const [programConfigPda] = multisig.getProgramConfigPda({});
        const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
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
          throw new Error(`Threshold must be between 1 and ${uniqueMembers.length}`);
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
        const fundVaultIx = SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: vaultPda,
          lamports: 20_000_000,
        });
        const tx = new Transaction().add(createIx, fundVaultIx);
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = latestBlockhash.blockhash;
        tx.partialSign(createKey);

        const signature = await wallet.sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

        addToast("Creating cofre bootstrap proposal...", "info");
        const initCofre = await buildInitCofreIxBrowser({
          multisig: multisigPda,
          operator,
        });
        const bootstrap = await createInitCofreProposal({
          connection,
          wallet,
          multisigPda,
          initCofreIx: initCofre.instruction,
          memo: "Initialize Cloak Squads cofre",
        });
        setBootstrapProposalIndex(bootstrap.transactionIndex.toString());
        setBootstrapState("proposal-created");

        if (threshold === 1) {
          addToast("Approving and executing cofre bootstrap...", "info");
          await proposalApprove({
            connection,
            wallet,
            multisigPda,
            transactionIndex: bootstrap.transactionIndex,
            memo: "Approve cofre bootstrap",
          });
          const executeSig = await vaultTransactionExecute({
            connection,
            wallet,
            multisigPda,
            transactionIndex: bootstrap.transactionIndex,
          });
          const executeBlockhash = await connection.getLatestBlockhash();
          await connection.confirmTransaction(
            { signature: executeSig, ...executeBlockhash },
            "confirmed",
          );
          setBootstrapState("initialized");
        }

        setCreatedPda(multisigPda.toBase58());
        setCreatedOperator(operator.toBase58());
        localStorage.setItem(OPERATOR_PREFERENCE_KEY, operator.toBase58());
        setState("success");
        addToast(
          threshold === 1
            ? "Multisig and cofre initialized successfully!"
            : "Multisig created. Cofre bootstrap proposal needs approvals.",
          "success",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create multisig";
        setError(message);
        setState("error");
        setBootstrapState("error");
        addToast(message, "error");
      }
    },
    [wallet, connection, memberInputs, threshold, operatorInput, addToast],
  );

  const walletConnected = wallet.connected && !!wallet.publicKey && !!wallet.sendTransaction;

  return (
    <AnimatedCard>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Create a new multisig</h2>
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
              { step: "2", text: "Define members, threshold, and operator", icon: "users" },
              { step: "3", text: "Create multisig and bootstrap the cofre", icon: "check" },
            ].map((item) => (
              <div
                key={item.step}
                className="flex items-center gap-3 rounded-lg border border-neutral-800/50 bg-neutral-950/50 px-4 py-3"
              >
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
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm font-semibold text-emerald-300">
                  Multisig created successfully!
                </span>
              </div>
              <p className="font-mono text-xs text-neutral-400 break-all bg-neutral-950/50 rounded-lg px-3 py-2">
                {createdPda}
              </p>
            </div>
            {createdOperator && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
                <p className="text-xs font-medium text-neutral-400">Operator wallet</p>
                <p className="mt-2 break-all font-mono text-xs text-neutral-200">
                  {createdOperator}
                </p>
              </div>
            )}
            {bootstrapProposalIndex && bootstrapState !== "initialized" && (
              <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-4">
                <p className="text-sm font-semibold text-amber-200">
                  Cofre bootstrap proposal #{bootstrapProposalIndex} needs Squads approval.
                </p>
                <p className="mt-1 text-xs text-amber-100/80">
                  Once approved and executed, this operator can run private executions.
                </p>
              </div>
            )}
            <Button onClick={() => onCreated(createdPda)} size="sm" className="w-full">
              Open multisig
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-5">
            <div>
              <p className="text-sm font-medium text-neutral-300 mb-2">Members</p>
              <p className="text-xs text-neutral-500 mb-3">
                Your wallet is automatically included as a member.
              </p>
              <StaggerContainer className="space-y-2" staggerDelay={0.05}>
                {memberInputs.map((value, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: member list has no stable id — index is intentional
                  <StaggerItem key={i}>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={value}
                        onChange={(e) => updateMember(i, e.target.value)}
                        placeholder={
                          i === 0 ? "Additional member pubkey (optional)" : "Member pubkey"
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
                          <svg
                            aria-hidden="true"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
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
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
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

            <div>
              <Label htmlFor="operator-wallet" className="mb-2 block">
                Operator wallet
              </Label>
              <Input
                id="operator-wallet"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={operatorInput}
                onChange={(e) => setOperatorInput(e.target.value)}
                placeholder={OPERATOR_PLACEHOLDER}
                className="font-mono text-xs"
                aria-describedby="operator-wallet-help"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setOperatorInput(wallet.publicKey?.toBase58() ?? "")}
                  className="inline-flex min-h-10 items-center rounded-md border border-neutral-700 px-3 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  Use my wallet
                </button>
                <button
                  type="button"
                  onClick={() => setOperatorInput("")}
                  className="inline-flex min-h-10 items-center rounded-md border border-neutral-700 px-3 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  Clear
                </button>
              </div>
              <p id="operator-wallet-help" className="mt-2 text-xs text-neutral-500">
                This wallet executes approved licenses. It can be a member wallet or a separate
                operator. Your last used operator is remembered on this device.
              </p>
            </div>

            <Button
              type="submit"
              disabled={state === "pending" || !walletConnected || !operatorInput.trim()}
              isLoading={state === "pending"}
              className="w-full"
            >
              {state === "pending" ? "Creating multisig..." : "Create multisig and cofre"}
            </Button>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
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

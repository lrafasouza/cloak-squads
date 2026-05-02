"use client";

import { Step1Details } from "@/components/create-vault/Step1Details";
import { Step2Members } from "@/components/create-vault/Step2Members";
import { Step3Review } from "@/components/create-vault/Step3Review";
import { WizardLayout } from "@/components/create-vault/WizardLayout";
import { useWizardStore } from "@/lib/use-wizard-store";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";

const STEP_META = [
  {
    title: "Name your vault",
    subtitle: "Give your shared treasury an identity. You can update this later.",
  },
  {
    title: "Add members",
    subtitle: "Add co-signers and set how many approvals are required to execute transactions.",
  },
  {
    title: "Review & deploy",
    subtitle: "Confirm the setup before signing and deploying on-chain.",
  },
];
const FALLBACK_STEP_META = {
  title: "Create vault",
  subtitle: "Set up a private shared treasury.",
};

export default function CreateVaultPage() {
  const wallet = useWallet();
  const myPubkey = wallet.publicKey?.toBase58() ?? "";

  const {
    state,
    hasDraftToResume,
    draft,
    setName,
    setDescription,
    setAvatar,
    addMember,
    removeMember,
    updateMember,
    setThreshold,
    setOperator,
    setCreatedMultisig,
    setBootstrapIndex,
    resumeDraft,
    discardDraft,
    next,
    back,
  } = useWizardStore(myPubkey);

  useEffect(() => {
    if (myPubkey && !state.operator) {
      setOperator(myPubkey);
    }
  }, [myPubkey, state.operator, setOperator]);

  const meta = STEP_META[state.step] ?? FALLBACK_STEP_META;

  return (
    <WizardLayout step={state.step} title={meta.title} subtitle={meta.subtitle}>
      {hasDraftToResume && draft ? (
        <div className="mb-5 rounded-xl border border-accent/30 bg-accent-soft/40 p-4">
          <p className="text-sm font-semibold text-ink">Resume previous draft?</p>
          <p className="mt-1 text-xs text-ink-muted">
            {draft.name || "Untitled vault"} has saved setup progress on this browser.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={resumeDraft}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
            >
              Start fresh
            </button>
          </div>
        </div>
      ) : null}
      {state.step === 0 && (
        <Step1Details
          name={state.name}
          description={state.description}
          avatarDataUrl={state.avatarDataUrl}
          onName={setName}
          onDescription={setDescription}
          onAvatar={setAvatar}
          onNext={next}
        />
      )}
      {state.step === 1 && (
        <Step2Members
          members={state.members}
          threshold={state.threshold}
          operator={state.operator}
          onAddMember={addMember}
          onRemoveMember={removeMember}
          onUpdateMember={updateMember}
          onThreshold={setThreshold}
          onOperator={setOperator}
          onNext={next}
          onBack={back}
        />
      )}
      {state.step === 2 && (
        <Step3Review
          name={state.name}
          description={state.description}
          members={state.members}
          threshold={state.threshold}
          operator={state.operator}
          avatarDataUrl={state.avatarDataUrl}
          createKeySecret={state.createKeySecret}
          createdMultisig={state.createdMultisig}
          bootstrapIndex={state.bootstrapIndex}
          onCreatedMultisig={setCreatedMultisig}
          onBootstrapIndex={setBootstrapIndex}
          onBack={back}
        />
      )}
    </WizardLayout>
  );
}

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

export default function CreateVaultPage() {
  const wallet = useWallet();
  const myPubkey = wallet.publicKey?.toBase58() ?? "";

  const {
    state,
    setName,
    setDescription,
    addMember,
    removeMember,
    updateMember,
    setThreshold,
    setOperator,
    next,
    back,
  } = useWizardStore(myPubkey);

  useEffect(() => {
    if (myPubkey && !state.operator) {
      setOperator(myPubkey);
    }
  }, [myPubkey, state.operator, setOperator]);

  const meta = STEP_META[state.step]!;

  return (
    <WizardLayout step={state.step} title={meta.title} subtitle={meta.subtitle}>
      {state.step === 0 && (
        <Step1Details
          name={state.name}
          description={state.description}
          onName={setName}
          onDescription={setDescription}
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
          onBack={back}
        />
      )}
    </WizardLayout>
  );
}

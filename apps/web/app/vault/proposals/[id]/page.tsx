"use client";

import { MissingActiveVault, useActiveVaultParams } from "@/components/app/ActiveVaultRoute";
import { AppShell } from "@/components/app/AppShell";
import { useParams } from "next/navigation";
import ProposalApprovalPage from "../../_active/proposals/[id]/page";

export default function ActiveVaultProposalApprovalPage() {
  const { id } = useParams<{ id: string }>();
  const params = useActiveVaultParams<{ id: string }>({ id });
  return (
    <AppShell>
      {params ? <ProposalApprovalPage params={params} /> : <MissingActiveVault />}
    </AppShell>
  );
}

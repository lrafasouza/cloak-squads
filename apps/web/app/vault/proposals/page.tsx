"use client";

import { MissingActiveVault, useActiveVaultParams } from "@/components/app/ActiveVaultRoute";
import { AppShell } from "@/components/app/AppShell";
import ProposalsListPage from "../_active/proposals/page";

export default function ActiveVaultProposalsPage() {
  const params = useActiveVaultParams();
  return (
    <AppShell>{params ? <ProposalsListPage params={params} /> : <MissingActiveVault />}</AppShell>
  );
}

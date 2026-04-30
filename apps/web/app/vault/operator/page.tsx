"use client";

import { MissingActiveVault, useActiveVaultParams } from "@/components/app/ActiveVaultRoute";
import { AppShell } from "@/components/app/AppShell";
import OperatorPage from "../_active/operator/page";

export default function ActiveVaultOperatorPage() {
  const params = useActiveVaultParams();
  return <AppShell>{params ? <OperatorPage params={params} /> : <MissingActiveVault />}</AppShell>;
}

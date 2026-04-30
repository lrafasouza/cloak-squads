"use client";

import { MissingActiveVault, useActiveVaultParams } from "@/components/app/ActiveVaultRoute";
import { AppShell } from "@/components/app/AppShell";
import AuditAdminPage from "../_active/audit/page";

export default function ActiveVaultAuditPage() {
  const params = useActiveVaultParams();
  return (
    <AppShell>{params ? <AuditAdminPage params={params} /> : <MissingActiveVault />}</AppShell>
  );
}

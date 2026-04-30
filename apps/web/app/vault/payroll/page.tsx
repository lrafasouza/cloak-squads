"use client";

import { MissingActiveVault, useActiveVaultParams } from "@/components/app/ActiveVaultRoute";
import { AppShell } from "@/components/app/AppShell";
import PayrollPage from "../_active/payroll/page";

export default function ActiveVaultPayrollPage() {
  const params = useActiveVaultParams();
  return <AppShell>{params ? <PayrollPage params={params} /> : <MissingActiveVault />}</AppShell>;
}

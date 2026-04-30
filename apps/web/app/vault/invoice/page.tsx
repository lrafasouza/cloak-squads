"use client";

import { MissingActiveVault, useActiveVaultParams } from "@/components/app/ActiveVaultRoute";
import { AppShell } from "@/components/app/AppShell";
import InvoicePage from "../_active/invoice/page";

export default function ActiveVaultInvoicePage() {
  const params = useActiveVaultParams();
  return <AppShell>{params ? <InvoicePage params={params} /> : <MissingActiveVault />}</AppShell>;
}

"use client";

import { MissingActiveVault, useActiveVaultParams } from "@/components/app/ActiveVaultRoute";
import { AppShell } from "@/components/app/AppShell";
import SendPage from "../_active/send/page";

export default function ActiveVaultSendPage() {
  const params = useActiveVaultParams();
  return <AppShell>{params ? <SendPage params={params} /> : <MissingActiveVault />}</AppShell>;
}

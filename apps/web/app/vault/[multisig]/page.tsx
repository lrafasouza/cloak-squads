"use client";

import { VaultDashboard } from "@/components/app/VaultDashboard";
import { use } from "react";

export default function VaultDashboardPage({ params }: { params: Promise<{ multisig: string }> }) {
  const { multisig } = use(params);
  return <VaultDashboard multisig={multisig} />;
}

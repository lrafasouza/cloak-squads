"use client";

import { MyVaultsProvider } from "@/lib/use-my-vaults";
import type { ReactNode } from "react";

export default function VaultLayout({ children }: { children: ReactNode }) {
  return <MyVaultsProvider>{children}</MyVaultsProvider>;
}

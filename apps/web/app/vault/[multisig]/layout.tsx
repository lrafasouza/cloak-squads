import { AppShell } from "@/components/app/AppShell";
import { WalletGuard } from "@/components/wallet/WalletGuard";
import type { ReactNode } from "react";

export default function CofreLayout({ children }: { children: ReactNode }) {
  return (
    <WalletGuard>
      <AppShell>{children}</AppShell>
    </WalletGuard>
  );
}

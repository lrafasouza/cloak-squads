import { WalletGuard } from "@/components/wallet/WalletGuard";
import type { ReactNode } from "react";

export default function VaultLayout({ children }: { children: ReactNode }) {
  return <WalletGuard>{children}</WalletGuard>;
}

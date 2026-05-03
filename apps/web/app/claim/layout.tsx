import { Logo } from "@/components/brand/Logo";
import { ClientWalletButton } from "@/components/wallet/ClientWalletButton";
import type { ReactNode } from "react";

export default function ClaimLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 md:px-6">
        <Logo href="/" size="md" />
        <ClientWalletButton />
      </header>
      {children}
    </>
  );
}

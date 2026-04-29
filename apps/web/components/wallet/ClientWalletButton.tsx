"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

export function ClientWalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="h-11 w-36 rounded-lg bg-surface-2 animate-pulse border border-border-strong"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="wallet-adapter-button-wrapper">
      <WalletMultiButton />
    </div>
  );
}

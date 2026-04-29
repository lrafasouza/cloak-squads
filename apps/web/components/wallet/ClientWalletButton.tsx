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
        className="h-11 w-36 rounded-lg bg-neutral-800 animate-pulse border border-neutral-700"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="wallet-adapter-button-wrapper">
      <WalletMultiButton
        style={{
          backgroundColor: "#10b981",
          borderRadius: "0.5rem",
          height: "2.75rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          padding: "0 1rem",
          transition: "all 0.2s",
        }}
      />
    </div>
  );
}

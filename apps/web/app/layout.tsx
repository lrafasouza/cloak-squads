import type { ReactNode } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";
import { WalletProviders } from "@/components/wallet/WalletProviders";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata = {
  title: "Cloak Squads",
  description: "Private multisig transactions on Solana",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <ErrorBoundary>
          <QueryProvider>
            <WalletProviders>
              <ToastProvider>{children}</ToastProvider>
            </WalletProviders>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";
import { CommandPalette } from "@/components/ui/command-palette";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ToastProvider } from "@/components/ui/toast-provider";
import { TransactionProgressProvider } from "@/components/ui/transaction-progress";
import { WalletProviders } from "@/components/wallet/WalletProviders";
import { Toaster } from "sonner";
import { fontDisplay, fontGaramond, fontMono, fontSans } from "./fonts";

export const metadata: Metadata = {
  title: "Aegis — Private execution for shared treasuries",
  description:
    "Private multisig payments on Solana. Single-use execution licenses for Squads vaults, settled privately through Cloak Protocol.",
  metadataBase: new URL("https://aegis.fi"),
  openGraph: {
    type: "website",
    url: "https://aegis.fi/",
    title: "Aegis — Private execution for shared treasuries",
    description:
      "Single-use execution licenses for Squads multisigs on Solana, settled privately through Cloak.",
    siteName: "Aegis",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aegis — Private execution for shared treasuries",
    description: "Single-use execution licenses for Squads multisigs on Solana.",
    creator: "@aegis_fi",
  },
  manifest: "/site.webmanifest",
  robots: "index, follow",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontGaramond.variable} ${fontSans.variable} ${fontMono.variable}`}>
      <body className="min-h-screen bg-bg text-ink font-sans antialiased">
        <ErrorBoundary>
          <QueryProvider>
            <WalletProviders>
              <ToastProvider>
                <TransactionProgressProvider>{children}</TransactionProgressProvider>
                <CommandPalette />
                <Toaster
                  position="bottom-right"
                  theme="dark"
                  toastOptions={{
                    classNames: {
                      toast: "border border-signal-positive/30 bg-signal-positive/10 text-ink shadow-raise-1",
                      description: "text-ink-muted",
                      actionButton: "bg-accent text-accent-ink hover:bg-accent-hover",
                      cancelButton: "bg-surface-2 text-ink-muted hover:bg-surface-3",
                      success: "!border-signal-positive/40 !bg-signal-positive/15",
                      error: "!border-signal-danger/30 !bg-signal-danger/10",
                      warning: "!border-signal-warn/30 !bg-signal-warn/10",
                    },
                  }}
                />
              </ToastProvider>
            </WalletProviders>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

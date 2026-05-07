import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";
import { AppToaster } from "@/components/providers/AppToaster";
import { ThemeProvider, themeNoFlashScript } from "@/components/providers/ThemeProvider";
import { CommandPalette } from "@/components/ui/command-palette";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ToastProvider } from "@/components/ui/toast-provider";
import { TransactionProgressProvider } from "@/components/ui/transaction-progress";
import { WalletProviders } from "@/components/wallet/WalletProviders";
import { fontDisplay, fontGaramond, fontMono, fontSans } from "./fonts";

export const metadata: Metadata = {
  title: "Aegis - Private execution for shared treasuries",
  description:
    "Private multisig payments on Solana. Single-use execution licenses for Squads vaults, settled privately through Cloak Protocol.",
  metadataBase: new URL("https://aegisz.xyz"),
  openGraph: {
    type: "website",
    url: "https://aegisz.xyz/",
    title: "Aegis - Private execution for shared treasuries",
    description:
      "Private multisig payments on Solana. Single-use execution licenses for Squads vaults, settled privately through Cloak Protocol.",
    siteName: "Aegis",
    locale: "en_US",
    images: [{
      url: "/og.jpg?v=3",
      width: 1200,
      height: 630,
      alt: "Aegis - Private execution for shared treasuries",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aegis - Private execution for shared treasuries",
    description: "Private multisig payments on Solana. Single-use execution licenses for Squads vaults, settled privately through Cloak Protocol.",
    images: ["/og.jpg?v=3"],
  },
  manifest: "/site.webmanifest",
  robots: "index, follow",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontDisplay.variable} ${fontGaramond.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <head>
        {/* Apply persisted theme before any paint — prevents FOUC on every nav */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body className="min-h-screen bg-bg text-ink font-sans antialiased">
        <ErrorBoundary>
          <ThemeProvider>
            <QueryProvider>
              <WalletProviders>
                <ToastProvider>
                  <TransactionProgressProvider>{children}</TransactionProgressProvider>
                  <CommandPalette />
                  <AppToaster />
                </ToastProvider>
              </WalletProviders>
            </QueryProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

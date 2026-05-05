import { EB_Garamond, Fraunces, Inter, Geist_Mono } from "next/font/google";

/**
 * Aegis typography system.
 *
 * - `display` (Fraunces): hero headlines, manifesto, large numerics. Serif moderna com axes ópticos.
 * - `garamond` (EB Garamond): Æ monogram and wordmark lockup. Serif clássica da marca.
 * - `sans` (Inter): UI body, labels, paragraphs. Já usado no projeto.
 * - `mono` (Geist Mono): hashes, addresses, amounts, TTLs. Auditabilidade visual.
 */

export const fontDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT"],
  weight: "variable",
});

export const fontGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-garamond",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

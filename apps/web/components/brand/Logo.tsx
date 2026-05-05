"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * Aegis logo system — Brand Deliverable v1.
 *
 * - `<Logo />`: lockup Æ + Aegis. Æ in EB Garamond 600 gold-leaf champagne;
 *   Aegis in EB Garamond 600 white.
 * - `<Logo variant="monogram" />`: só o Æ (favicon, app icon, watermark).
 * - `<Logo variant="wordmark" />`: só `Aegis` em EB Garamond 600.
 *
 * Brand spec: https://api.anthropic.com/v1/design/h/2GLCu6TDhvNF7noPfN5obg
 */

type LogoVariant = "full" | "monogram" | "wordmark";

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  href?: string | null;
  size?: "sm" | "md" | "lg";
}

const sizes: Record<NonNullable<LogoProps["size"]>, { mono: string; word: string; gap: string }> = {
  sm: { mono: "text-xl", word: "text-base", gap: "gap-2" },
  md: { mono: "text-[30px]", word: "text-xl", gap: "gap-2.5" },
  lg: { mono: "text-4xl", word: "text-2xl", gap: "gap-3" },
};

export function Logo({ variant = "full", className, href = "/", size = "md" }: LogoProps) {
  const s = sizes[size];

  const content = (
    <span className={cn("inline-flex items-center", s.gap, className)}>
      {variant !== "wordmark" && (
        <span
          aria-hidden={variant === "monogram" ? undefined : true}
          className={cn(
            "font-garamond font-semibold leading-none",
            "text-accent",
            s.mono,
          )}
          style={{ letterSpacing: "-0.02em" }}
        >
          Æ
        </span>
      )}
      {variant !== "monogram" && (
        <span
          className={cn(
            "font-garamond font-semibold leading-none",
            "text-ink",
            s.word,
          )}
          style={{ letterSpacing: "-0.005em" }}
        >
          Aegis
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label="Aegis — home" className="inline-flex items-center">
      {content}
    </Link>
  );
}

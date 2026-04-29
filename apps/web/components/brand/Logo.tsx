"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * Aegis logo system.
 *
 * - `<Logo />`: monograma Æ + wordmark `aegis` lowercase, horizontal.
 * - `<Logo variant="monogram" />`: só o Æ (favicon, app icon, watermark).
 * - `<Logo variant="wordmark" />`: só `aegis` em Fraunces bold.
 *
 * Uma cor (currentColor) — herda do contexto. Em telas com fundo escuro, aplique `text-ink`
 * ou `text-accent` no parent.
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
  md: { mono: "text-2xl", word: "text-lg", gap: "gap-2.5" },
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
            "font-display font-bold leading-none tracking-tight",
            "text-accent",
            s.mono,
          )}
        >
          Æ
        </span>
      )}
      {variant !== "monogram" && (
        <span
          className={cn(
            "font-display font-semibold leading-none lowercase",
            "text-ink",
            s.word,
          )}
          style={{ letterSpacing: "-0.02em" }}
        >
          aegis
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

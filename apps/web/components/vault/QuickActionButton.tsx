"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface QuickActionButtonProps {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function QuickActionButton({
  icon: Icon,
  label,
  href,
  onClick,
  className,
}: QuickActionButtonProps) {
  const content: ReactNode = (
    <>
      <Icon className="h-4 w-4" />
      {label}
    </>
  );
  const classes = cn(
    "flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

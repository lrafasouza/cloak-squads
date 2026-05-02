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
    "flex items-center justify-center gap-2 rounded-xl bg-surface py-3 text-sm font-medium text-ink-muted transition-all hover:bg-surface-2 hover:text-accent",
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

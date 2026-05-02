"use client";

import { cn } from "@/lib/utils";

interface PageTitleProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  as?: "h1" | "h2";
}

export function PageTitle({ children, actions, className, as: Tag = "h1" }: PageTitleProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <Tag className="text-xl font-semibold tracking-tight text-ink">{children}</Tag>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

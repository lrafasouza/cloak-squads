"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function Toast({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface p-3 text-sm text-ink shadow-raise-1",
        className,
      )}
      {...props}
    />
  );
}

export function ToastTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-semibold text-ink", className)} {...props} />;
}

export function ToastDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-1 text-ink-muted", className)} {...props} />;
}

export function Toaster({ children }: { children?: ReactNode }) {
  return <div className="fixed bottom-4 right-4 z-50 grid max-w-sm gap-2">{children}</div>;
}

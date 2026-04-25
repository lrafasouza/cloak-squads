"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Toast({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-100 shadow-lg", className)}
      {...props}
    />
  );
}

export function ToastTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-semibold text-neutral-50", className)} {...props} />;
}

export function ToastDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-1 text-neutral-300", className)} {...props} />;
}

export function Toaster({ children }: { children?: ReactNode }) {
  return <div className="fixed bottom-4 right-4 z-50 grid max-w-sm gap-2">{children}</div>;
}

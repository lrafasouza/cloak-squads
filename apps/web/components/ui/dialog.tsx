"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function Dialog({ open, children }: { open: boolean; children: ReactNode }) {
  return open ? <>{children}</> : null;
}

export function DialogContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 p-4">
      <div
        className={cn(
          "w-full max-w-lg rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-xl",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function DialogHeader(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold text-neutral-50", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-neutral-400", className)} {...props} />;
}

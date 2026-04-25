"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Sheet({ open, children }: { open: boolean; children: ReactNode }) {
  return open ? <>{children}</> : null;
}

export function SheetContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/70">
      <aside className={cn("ml-auto h-full w-full max-w-md border-l border-neutral-800 bg-neutral-900 p-5 shadow-xl", className)} {...props} />
    </div>
  );
}

export function SheetHeader(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

export function SheetTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold text-neutral-50", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-neutral-400", className)} {...props} />;
}

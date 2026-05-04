"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { type HTMLAttributes, type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { Drawer } from "vaul";
import { AutoCloseIndicator } from "./auto-close-indicator";

interface SheetContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("Sheet compound components must be used inside <Sheet>");
  return ctx;
}

/* ── Root ── */
export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const value = {
    open: isControlled ? (open as boolean) : internalOpen,
    setOpen: (v: boolean) => {
      if (!isControlled) setInternalOpen(v);
      onOpenChange?.(v);
    },
  };

  return (
    <SheetContext.Provider value={value}>
      <Drawer.Root open={value.open} onOpenChange={value.setOpen} direction="right" shouldScaleBackground={false}>
        {children}
      </Drawer.Root>
    </SheetContext.Provider>
  );
}

/* ── Trigger ── */
export function SheetTrigger({ children, asChild, ...props }: HTMLAttributes<HTMLButtonElement> & { asChild?: boolean; children: ReactNode }) {
  const { setOpen } = useSheet();
  if (asChild) return <>{children}</>;
  return (
    <Drawer.Trigger asChild>
      <button type="button" {...props} onClick={(e) => { setOpen(true); props.onClick?.(e); }}>
        {children}
      </button>
    </Drawer.Trigger>
  );
}

/* ── Portal + Overlay + Content ── */
export function SheetContent({
  className,
  children,
  side = "right",
  autoClose = false,
}: {
  className?: string;
  children: ReactNode;
  side?: "right" | "bottom";
  autoClose?: boolean;
}) {
  const { open, setOpen } = useSheet();
  const [autoCloseKey, setAutoCloseKey] = useState(0);

  /* Auto-close after 10 seconds (opt-out with autoClose={false}) */
  useEffect(() => {
    if (!autoClose) return;
    if (!open) {
      setAutoCloseKey((k) => k + 1);
      return;
    }
    const timer = setTimeout(() => {
      setOpen(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, [open, setOpen, autoClose]);

  const sideClasses = {
    right: "inset-y-0 right-0 h-full w-full max-w-[480px] border-l border-border",
    bottom: "inset-x-0 bottom-0 h-auto max-h-[90vh] border-t border-border rounded-t-xl",
  };

  return (
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm" />
      <Drawer.Content
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-raise-2",
          sideClasses[side],
          className,
        )}
      >
        {side === "bottom" && <div className="mx-auto mt-4 h-1.5 w-12 rounded-full bg-border-strong" />}
        <div className="flex items-center justify-between p-5">
          <div />
          <div className="flex items-center gap-2">
            {autoClose && (
              <AutoCloseIndicator
                key={autoCloseKey}
                durationMs={10000}
                onComplete={() => setOpen(false)}
                paused={!open}
              />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {children}
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  );
}

/* ── Header / Title / Description / Footer ── */
export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pt-2 pb-0", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <Drawer.Title asChild>
      <h2 className={cn("font-display text-lg font-semibold text-ink", className)} {...props} />
    </Drawer.Title>
  );
}

export function SheetDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1.5 text-sm text-ink-muted leading-relaxed", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse gap-3 p-5 pt-4 sm:flex-row sm:justify-end", className)} {...props} />;
}

export function SheetClose({ className, children, ...props }: HTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  const { setOpen } = useSheet();
  return (
    <button
      type="button"
      className={cn("inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors", className)}
      {...props}
      onClick={(e) => { setOpen(false); props.onClick?.(e); }}
    >
      {children ?? "Close"}
    </button>
  );
}

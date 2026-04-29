"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type HTMLAttributes, type ReactNode, createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DialogContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  dialogId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("Dialog compound components must be used inside <Dialog>");
  return ctx;
}

/* ── Root ── */
export function Dialog({
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
  const dialogId = useId();

  const value = {
    open: isControlled ? (open as boolean) : internalOpen,
    setOpen: (v: boolean) => {
      if (!isControlled) setInternalOpen(v);
      onOpenChange?.(v);
    },
    dialogId,
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
    </DialogContext.Provider>
  );
}

/* ── Trigger ── */
export function DialogTrigger({ children, asChild, ...props }: HTMLAttributes<HTMLButtonElement> & { asChild?: boolean; children: ReactNode }) {
  const { setOpen } = useDialog();
  if (asChild) return <>{children}</>;
  return (
    <button type="button" {...props} onClick={(e) => { setOpen(true); props.onClick?.(e); }}>
      {children}
    </button>
  );
}

/* ── Portal + Overlay + Content ── */
export function DialogContent({
  className,
  children,
  size = "md",
}: {
  className?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const { open, setOpen, dialogId } = useDialog();
  const contentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* ESC */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  /* Click outside */
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target === e.currentTarget) setOpen(false);
    },
    [setOpen],
  );

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  };

  const node = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-md"
            onPointerDown={onPointerDown}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2",
              "rounded-xl border border-border bg-surface shadow-raise-2",
              sizes[size],
              className,
            )}
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={`${dialogId}-desc`}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(node, document.body);
}

/* ── Header / Title / Description / Footer / Close ── */
export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-0", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  const { dialogId } = useDialog();
  return <h2 id={`${dialogId}-title`} className={cn("font-display text-lg font-semibold text-ink pr-10", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const { dialogId } = useDialog();
  return <p id={`${dialogId}-desc`} className={cn("mt-1.5 text-sm text-ink-muted leading-relaxed", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse gap-3 p-6 pt-4 sm:flex-row sm:justify-end", className)} {...props} />;
}

export function DialogClose({ className, children, ...props }: HTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  const { setOpen } = useDialog();
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

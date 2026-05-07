"use client";

import { HeraldicWatermark } from "@/components/brand/HeraldicWatermark";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type HTMLAttributes, type ReactNode, createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AutoCloseIndicator } from "./auto-close-indicator";

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

// Body scroll-lock is ref-counted at the module level so nested or
// overlapping dialogs unlock only once the last one closes. We also
// compensate the scrollbar width to keep the page from shifting when
// overflow flips from `auto` to `hidden`.
let openDialogCount = 0;
let savedOverflow: string | null = null;
let savedPaddingRight: string | null = null;

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
  autoClose = false,
  watermark = false,
  watermarkSize = 240,
  watermarkOpacity = 0.045,
}: {
  className?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  autoClose?: boolean;
  /** Render the heraldic Æ watermark inside the dialog. Reserved for
   *  surfaces that authorize value movement (Send, Swap, PrivacyFlow). */
  watermark?: boolean;
  /** Override watermark size (px). Default 240 — fits the modal frame. */
  watermarkSize?: number;
  /** Override watermark opacity. Default 0.045 (subtle whisper). */
  watermarkOpacity?: number;
}) {
  const { open, setOpen, dialogId } = useDialog();
  const contentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [autoCloseKey, setAutoCloseKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  /* ESC */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  /* Body scroll-lock while open */
  useEffect(() => {
    if (!open) return;
    if (openDialogCount === 0) {
      const body = document.body;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      savedOverflow = body.style.overflow;
      savedPaddingRight = body.style.paddingRight;
      body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    openDialogCount += 1;
    return () => {
      openDialogCount -= 1;
      if (openDialogCount === 0) {
        const body = document.body;
        body.style.overflow = savedOverflow ?? "";
        body.style.paddingRight = savedPaddingRight ?? "";
        savedOverflow = null;
        savedPaddingRight = null;
      }
    };
  }, [open]);

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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-md p-4"
          onPointerDown={onPointerDown}
          aria-hidden="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative w-full overflow-hidden",
              "rounded-modal border border-border bg-surface shadow-raise-2",
              sizes[size],
              className,
            )}
            style={{
              boxShadow:
                "0 1px 0 0 hsl(var(--inset-highlight)) inset, 0 18px 56px -16px rgb(0 0 0 / 0.5)",
            }}
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={`${dialogId}-desc`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Heraldic gold seal — the "we are about to sign value" signal */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent/0 via-accent to-accent/0"
            />

            {/* Optional Æ watermark — opt-in via `watermark` prop */}
            {watermark && (
              <HeraldicWatermark size={watermarkSize} opacity={watermarkOpacity} />
            )}

            <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(node, document.body);
}

/* ── Header / Title / Description / Footer / Close ── */
export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // Top padding 24 (28 visually with the 3px ribbon above the content edge),
  // bottom 0 — body owns the spacing below the title block.
  return <div className={cn("px-6 pt-7 pb-0", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  const { dialogId } = useDialog();
  return (
    <h2
      id={`${dialogId}-title`}
      className={cn(
        "font-display text-xl font-semibold tracking-tight text-ink pr-10",
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const { dialogId } = useDialog();
  return (
    <p
      id={`${dialogId}-desc`}
      className={cn("mt-1.5 text-sm leading-relaxed text-ink-muted", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // Padding here matches DialogHeader so consumers using the default
  // shell stay symmetric. Modals with custom footer chrome (SendModal,
  // SwapModal) override with `p-0 pt-0`.
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-3 px-6 pb-6 pt-5",
        "sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
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

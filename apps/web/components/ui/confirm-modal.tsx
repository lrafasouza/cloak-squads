"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "default" | "destructive" | "secondary";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "default",
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  const node = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm"
            onClick={onCancel}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "pointer-events-auto w-[calc(100%-2rem)] max-w-md",
                "rounded-xl border border-border bg-surface p-6 shadow-raise-2",
              )}
            >
            <div className="relative flex items-start gap-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  confirmVariant === "destructive"
                    ? "bg-signal-danger/15 text-signal-danger"
                    : "bg-accent-soft text-accent",
                )}
              >
                {confirmVariant === "destructive" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <HelpCircle className="h-5 w-5" />
                )}
              </div>

              <div className="flex-1 pr-10">
                <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{description}</p>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={onCancel} disabled={isLoading}>
                    {cancelText}
                  </Button>
                  <Button
                    ref={confirmRef}
                    variant={confirmVariant}
                    onClick={onConfirm}
                    disabled={isLoading}
                    isLoading={isLoading}
                  >
                    {confirmText}
                  </Button>
                </div>
              </div>

              <div className="absolute right-0 top-0">
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(node, document.body);
}

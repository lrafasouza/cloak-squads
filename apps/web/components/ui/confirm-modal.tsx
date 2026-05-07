"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "default" | "destructive" | "secondary";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * Generic confirm/destructive modal — used wherever an irreversible
 * action needs explicit acknowledgement (Remove member, Cancel
 * recurring, Sign audit export, etc.).
 *
 * Uses the Dialog primitive so every confirm modal automatically gets
 * the heraldic gold seal at the top edge, the modal radius, the
 * inset highlight, and the same enter/exit easing as Send / Receive /
 * Swap. Drops the previous local framer-motion implementation in
 * favour of the shared primitive.
 */
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

  // Focus the primary action so keyboard users can confirm with Enter
  // or back out with Escape (Dialog primitive handles ESC).
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  const isDestructive = confirmVariant === "destructive";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isLoading) onCancel();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-start gap-3.5 pr-8">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                isDestructive
                  ? "border-signal-danger/35 bg-signal-danger/10 text-signal-danger"
                  : "border-accent/30 bg-accent-soft text-accent",
              )}
            >
              {isDestructive ? (
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              ) : (
                <HelpCircle className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-eyebrow",
                  isDestructive ? "text-signal-danger" : "text-ink-muted",
                )}
              >
                {isDestructive ? "Destructive · Confirm" : "Confirm"}
              </p>
              <DialogTitle className="mt-0.5">{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

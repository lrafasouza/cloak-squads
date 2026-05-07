"use client";

import { useTheme } from "@/components/providers/ThemeProvider";
import { Toaster } from "sonner";

/**
 * Sonner Toaster wired to follow the active Aegis theme. Lives in a tiny
 * client wrapper so the theme prop reacts to user changes.
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme}
      toastOptions={{
        classNames: {
          toast:
            "border border-signal-positive/30 bg-signal-positive/10 text-ink shadow-raise-1",
          description: "text-ink-muted",
          actionButton: "bg-accent text-accent-ink hover:bg-accent-hover",
          cancelButton: "bg-surface-2 text-ink-muted hover:bg-surface-3",
          success: "!border-signal-positive/40 !bg-signal-positive/15",
          error: "!border-signal-danger/30 !bg-signal-danger/10",
          warning: "!border-signal-warn/30 !bg-signal-warn/10",
        },
      }}
    />
  );
}

"use client";

import { toast as sonner } from "sonner";
import { type ReactNode, createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastContextType {
  addToast: (message: string, type: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [activeIds] = useState<Set<string>>(new Set());

  const addToast = useCallback((message: string, type: ToastType, duration = 5000) => {
    const id = `aegis-${Date.now().toString(36)}`;
    activeIds.add(id);

    const cleanup = () => activeIds.delete(id);

    const opts = { id, duration, onAutoClose: cleanup, onDismiss: cleanup };

    if (type === "success") sonner.success(message, opts);
    else if (type === "error") sonner.error(message, opts);
    else if (type === "warning") sonner.warning(message, opts);
    else sonner(message, opts);
  }, [activeIds]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
    </ToastContext.Provider>
  );
}

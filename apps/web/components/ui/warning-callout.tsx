"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";

const variants = {
  warning: {
    container: "border-signal-warn/30 bg-signal-warn/8",
    icon: "text-signal-warn",
    text: "text-signal-warn",
    Icon: AlertTriangle,
  },
  info: {
    container: "border-border bg-surface-2",
    icon: "text-ink-muted",
    text: "text-ink-muted",
    Icon: Info,
  },
  error: {
    container: "border-signal-danger/30 bg-signal-danger/8",
    icon: "text-signal-danger",
    text: "text-signal-danger",
    Icon: XCircle,
  },
  success: {
    container: "border-signal-positive/30 bg-signal-positive/8",
    icon: "text-signal-positive",
    text: "text-signal-positive",
    Icon: CheckCircle,
  },
} as const;

interface WarningCalloutProps {
  variant?: keyof typeof variants;
  children: React.ReactNode;
  className?: string;
}

export function InfoCallout({ children, className }: { children: React.ReactNode; className?: string }) {
  return <WarningCallout variant="info" {...(className ? { className } : {})}>{children}</WarningCallout>;
}

export function ErrorCallout({ children, className }: { children: React.ReactNode; className?: string }) {
  return <WarningCallout variant="error" {...(className ? { className } : {})}>{children}</WarningCallout>;
}

export function WarningCallout({
  variant = "warning",
  children,
  className,
}: WarningCalloutProps) {
  const v = variants[variant];
  const Icon = v.Icon;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm",
        v.container,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", v.icon)} />
      <span className={cn("leading-snug", v.text)}>{children}</span>
    </div>
  );
}

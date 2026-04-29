import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "destructive" | "ghost" | "accent-soft" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  isLoading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "default", isLoading, children, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        "active:scale-[0.98]",
        variant === "default" &&
          "bg-accent text-accent-ink hover:bg-accent-hover shadow-raise-1",
        variant === "secondary" &&
          "bg-surface-2 text-ink hover:bg-surface-3 border border-border",
        variant === "outline" &&
          "border border-border-strong text-ink hover:bg-surface-2 bg-transparent",
        variant === "destructive" &&
          "bg-signal-danger/15 text-signal-danger border border-signal-danger/30 hover:bg-signal-danger/25",
        variant === "ghost" && "text-ink-muted hover:text-ink hover:bg-surface-2",
        variant === "accent-soft" &&
          "bg-accent-soft text-accent border border-accent/20 hover:border-accent/40",
        variant === "link" && "text-accent underline-offset-4 hover:underline",
        size === "default" && "min-h-11 px-5 py-2.5",
        size === "sm" && "min-h-9 px-4 py-2 text-xs",
        size === "lg" && "min-h-12 px-6 py-3 text-base",
        size === "icon" && "h-10 w-10",
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);

Button.displayName = "Button";

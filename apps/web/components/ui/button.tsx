import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { Spinner } from "./skeleton";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "destructive" | "ghost" | "gradient";
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
        "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950",
        "disabled:pointer-events-none disabled:opacity-50",
        "active:scale-[0.98]",
        variant === "default" &&
          "bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20",
        variant === "secondary" &&
          "bg-neutral-800 text-neutral-100 hover:bg-neutral-700 border border-neutral-700",
        variant === "outline" &&
          "border-2 border-neutral-700 text-neutral-100 hover:bg-neutral-800 hover:border-neutral-600",
        variant === "destructive" &&
          "bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/20",
        variant === "ghost" && "text-neutral-100 hover:bg-neutral-800/80",
        variant === "gradient" &&
          "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/25",
        size === "default" && "min-h-11 px-5 py-2.5",
        size === "sm" && "min-h-9 px-4 py-2 text-xs",
        size === "lg" && "min-h-12 px-6 py-3 text-base",
        size === "icon" && "h-10 w-10",
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Spinner size="sm" className="mr-2" />}
      {children}
    </button>
  ),
);

Button.displayName = "Button";

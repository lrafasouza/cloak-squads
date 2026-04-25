import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "destructive" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:pointer-events-none disabled:opacity-50",
        variant === "default" && "bg-emerald-400 text-neutral-950 hover:bg-emerald-300",
        variant === "secondary" && "bg-neutral-800 text-neutral-100 hover:bg-neutral-700",
        variant === "outline" && "border border-neutral-700 text-neutral-100 hover:bg-neutral-800",
        variant === "destructive" && "bg-red-500 text-white hover:bg-red-400",
        variant === "ghost" && "text-neutral-100 hover:bg-neutral-800",
        size === "default" && "min-h-10 px-4 py-2",
        size === "sm" && "min-h-9 px-3 py-2",
        size === "lg" && "min-h-11 px-5 py-2",
        size === "icon" && "h-10 w-10",
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";

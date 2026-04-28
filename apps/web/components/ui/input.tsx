import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100",
        "placeholder:text-neutral-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:border-emerald-400/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-all duration-200",
        "hover:border-neutral-600",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[100px] w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100",
        "placeholder:text-neutral-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:border-emerald-400/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-all duration-200",
        "hover:border-neutral-600",
        "resize-y",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

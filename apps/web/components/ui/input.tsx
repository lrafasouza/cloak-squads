import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "min-h-11 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink font-mono num",
        "placeholder:text-ink-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-colors duration-150",
        "hover:border-border-strong",
        "inner-shadow",
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
        "min-h-[100px] w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink",
        "placeholder:text-ink-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-colors duration-150",
        "hover:border-border-strong",
        "resize-y",
        "inner-shadow",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

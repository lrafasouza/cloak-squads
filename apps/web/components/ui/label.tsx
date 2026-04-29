import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes } from "react";
import { forwardRef } from "react";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: generic shadcn Label — callers are responsible for associating with a control
    <label ref={ref} className={cn("text-sm font-medium text-neutral-100", className)} {...props} />
  ),
);
Label.displayName = "Label";

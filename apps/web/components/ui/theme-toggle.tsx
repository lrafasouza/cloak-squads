"use client";

import { type Theme, useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Three-state segmented toggle: System / Light / Dark.
 *
 * Compact variant (`size="sm"`) is icon-only — fits the topbar.
 * Default variant labels the active option.
 */

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({
  size = "sm",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isSm = size === "sm";

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-surface p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex items-center justify-center rounded-[5px] transition-aegis",
              isSm ? "h-6 w-6" : "h-8 px-2.5 gap-1.5 text-xs font-medium",
              active
                ? "bg-accent text-accent-ink shadow-raise-1"
                : "text-ink-subtle hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className={isSm ? "h-3.5 w-3.5" : "h-3.5 w-3.5"} strokeWidth={1.75} />
            {!isSm && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One-tap dark/light toggle (skips System). Useful for places that need a single
 * affordance — e.g. a settings menu row or a marketing nav.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolvedTheme, toggle } = useTheme();
  const ref = useRef<HTMLButtonElement | null>(null);

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-ink-muted transition-aegis hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  );
}

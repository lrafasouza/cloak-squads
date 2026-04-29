"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

const TabsContext = createContext<{ value: string; setValue: (value: string) => void } | null>(
  null,
);

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value ?? internalValue;
  const contextValue = useMemo(
    () => ({
      value: currentValue,
      setValue: (next: string) => {
        setInternalValue(next);
        onValueChange?.(next);
      },
    }),
    [currentValue, onValueChange],
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-border bg-surface p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const tabs = useContext(TabsContext);
  const active = tabs?.value === value;
  return (
    <button
      type="button"
      onClick={() => tabs?.setValue(value)}
      className={cn(
        "min-h-9 rounded px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:text-ink",
        active && "bg-surface-2 text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  value,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const tabs = useContext(TabsContext);
  if (tabs?.value !== value) return null;
  return <div className={cn("mt-4", className)} {...props} />;
}

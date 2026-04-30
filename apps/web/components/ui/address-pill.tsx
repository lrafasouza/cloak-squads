"use client";

import { cn } from "@/lib/utils";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

interface AddressPillProps {
  value: string;
  chars?: number;
  explorerBase?: string;
  className?: string;
  monospace?: boolean;
}

function truncate(value: string, chars: number) {
  if (value.length <= chars * 2 + 3) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

export function AddressPill({
  value,
  chars = 4,
  explorerBase = "https://solscan.io/account",
  className,
  monospace = true,
}: AddressPillProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs",
        monospace && "font-mono",
        "text-ink-muted",
        className,
      )}
    >
      <span>{truncate(value, chars)}</span>
      <button
        type="button"
        onClick={copy}
        className="text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none"
        aria-label="Copy address"
      >
        {copied ? <Check className="h-3 w-3 text-signal-positive" /> : <Copy className="h-3 w-3" />}
      </button>
      <a
        href={`${explorerBase}/${value}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none"
        aria-label="View on explorer"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </span>
  );
}

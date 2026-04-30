"use client";

import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { cn } from "@/lib/utils";
import { ImagePlus } from "lucide-react";
import { useRef } from "react";

interface Step1DetailsProps {
  name: string;
  description: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onNext: () => void;
}

export function Step1Details({ name, description, onName, onDescription, onNext }: Step1DetailsProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const isValid = name.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Card */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-raise-1">
        <h2 className="mb-5 text-sm font-semibold text-ink-muted uppercase tracking-wider">
          Vault identity
        </h2>

        {/* Avatar + Name row */}
        <div className="flex items-center gap-4">
          {/* Identicon slot */}
          <div className="relative flex-shrink-0">
            <div
              className={cn(
                "h-14 w-14 overflow-hidden rounded-xl border border-border-strong",
                !name && "bg-surface-2",
              )}
            >
              {name ? (
                <VaultIdenticon seed={name} size={56} className="h-14 w-14" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImagePlus className="h-5 w-5 text-ink-subtle" />
                </div>
              )}
            </div>
          </div>

          {/* Name input */}
          <div className="flex-1">
            <label htmlFor="vault-name" className="mb-1.5 block text-xs font-medium text-ink-muted">
              Vault name <span className="text-signal-danger">*</span>
            </label>
            <input
              ref={nameRef}
              id="vault-name"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="My Treasury"
              className={cn(
                "w-full rounded-lg border bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle",
                "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-border-strong",
                "transition-colors",
                name.length === 32
                  ? "border-signal-warn/60"
                  : "border-border hover:border-border-strong",
              )}
            />
            <div className="mt-1 flex justify-between">
              <span className="text-xs text-ink-subtle">
                Your identicon is generated from the name
              </span>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  name.length > 28 ? "text-signal-warn" : "text-ink-subtle",
                )}
              >
                {name.length}/32
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-5">
          <label
            htmlFor="vault-desc"
            className="mb-1.5 block text-xs font-medium text-ink-muted"
          >
            Description{" "}
            <span className="text-ink-subtle font-normal">(optional)</span>
          </label>
          <input
            id="vault-desc"
            type="text"
            autoComplete="off"
            maxLength={64}
            value={description}
            onChange={(e) => onDescription(e.target.value)}
            placeholder="e.g. Protocol team treasury"
            className={cn(
              "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle",
              "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-border-strong",
              "hover:border-border-strong transition-colors",
            )}
          />
          <div className="mt-1 flex justify-end">
            <span
              className={cn(
                "text-xs tabular-nums",
                description.length > 56 ? "text-signal-warn" : "text-ink-subtle",
              )}
            >
              {description.length}/64
            </span>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!isValid}
          onClick={onNext}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all",
            "shadow-raise-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            isValid
              ? "bg-accent text-accent-ink hover:bg-accent-hover cursor-pointer"
              : "bg-surface-2 text-ink-subtle cursor-not-allowed",
          )}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

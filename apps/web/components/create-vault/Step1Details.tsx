"use client";

import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { cn } from "@/lib/utils";
import { useRef } from "react";

interface Step1DetailsProps {
  name: string;
  description: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onNext: () => void;
}

export function Step1Details({
  name,
  description,
  onName,
  onDescription,
  onNext,
}: Step1DetailsProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const isValid = name.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="card-hero relative">
        {/* Brass top rail */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        <div className="px-7 py-8 md:px-9 md:py-10">
          <p className="text-eyebrow">Vault identity</p>

          {/* Identicon + name */}
          <div className="mt-6 flex items-start gap-6">
            <div className="relative shrink-0">
              <div className="overflow-hidden rounded-panel border border-border-strong bg-surface-2 shadow-raise-1">
                <VaultIdenticon seed={name} size={88} className="h-[88px] w-[88px]" />
              </div>
              {/* Brass corner mark */}
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-2 font-display text-[10px] font-semibold text-accent">
                Æ
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <label
                htmlFor="vault-name"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
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
                placeholder="Treasury"
                className={cn(
                  "w-full rounded-md border bg-surface-2 px-3.5 py-2.5 font-display text-lg text-ink placeholder:text-ink-subtle/70",
                  "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-border-strong",
                  "transition-aegis",
                  name.length === 32
                    ? "border-signal-warn/60"
                    : "border-border hover:border-border-strong",
                )}
              />
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="text-[11px] italic text-ink-subtle/80">
                  The crest is forged from the name
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    name.length > 28 ? "text-signal-warn" : "text-ink-subtle",
                  )}
                >
                  {name.length}/32
                </span>
              </div>
            </div>
          </div>

          {/* Brass divider */}
          <div className="mt-7 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* Description */}
          <div className="mt-6">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label htmlFor="vault-desc" className="text-sm font-medium text-ink">
                Description <span className="text-ink-subtle font-normal">(optional)</span>
              </label>
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  description.length > 56 ? "text-signal-warn" : "text-ink-subtle",
                )}
              >
                {description.length}/64
              </span>
            </div>
            <input
              id="vault-desc"
              type="text"
              autoComplete="off"
              maxLength={64}
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              placeholder="e.g. Protocol team treasury"
              className={cn(
                "w-full rounded-md border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle/70",
                "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-border-strong",
                "hover:border-border-strong transition-aegis",
              )}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!isValid}
          onClick={onNext}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-md px-7 py-2.5 text-sm font-semibold transition-aegis",
            "shadow-raise-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            isValid
              ? "bg-accent text-accent-ink hover:bg-accent-hover cursor-pointer"
              : "bg-surface-2 text-ink-subtle cursor-not-allowed",
          )}
        >
          Continue
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

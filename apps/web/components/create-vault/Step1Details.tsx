"use client";

import { VaultAvatarPicker } from "@/components/create-vault/VaultAvatarPicker";
import { cn } from "@/lib/utils";
import { useRef } from "react";

interface Step1DetailsProps {
  name: string;
  description: string;
  avatarDataUrl: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onAvatar: (v: string) => void;
  onNext: () => void;
}

export function Step1Details({
  name,
  description,
  avatarDataUrl,
  onName,
  onDescription,
  onAvatar,
  onNext,
}: Step1DetailsProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const isValid = name.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Card */}
      <div className="rounded-xl border border-border bg-surface p-8 shadow-raise-1">
        <h2 className="mb-6 text-sm font-semibold text-ink-muted uppercase tracking-wider">
          Vault identity
        </h2>

        {/* Avatar + Name row */}
        <div className="flex items-center gap-5">
          <VaultAvatarPicker seed={name} avatarDataUrl={avatarDataUrl} onAvatar={onAvatar} />

          {/* Name input */}
          <div className="flex-1">
            <label htmlFor="vault-name" className="mb-2 block text-sm font-medium text-ink">
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
                "w-full rounded-lg border bg-surface-2 px-4 py-3 text-base text-ink placeholder:text-ink-subtle",
                "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-border-strong",
                "transition-colors",
                name.length === 32
                  ? "border-signal-warn/60"
                  : "border-border hover:border-border-strong",
              )}
            />
            <div className="mt-1.5 flex justify-between">
              <span className="text-sm text-ink-subtle">
                Your identicon is generated from the name
              </span>
              <span
                className={cn(
                  "text-sm tabular-nums",
                  name.length > 28 ? "text-signal-warn" : "text-ink-subtle",
                )}
              >
                {name.length}/32
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-6">
          <label htmlFor="vault-desc" className="mb-2 block text-sm font-medium text-ink">
            Description <span className="text-ink-subtle font-normal">(optional)</span>
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
              "w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-base text-ink placeholder:text-ink-subtle",
              "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-border-strong",
              "hover:border-border-strong transition-colors",
            )}
          />
          <div className="mt-1.5 flex justify-end">
            <span
              className={cn(
                "text-sm tabular-nums",
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
            "inline-flex min-h-11 items-center gap-2 rounded-lg px-8 py-3 text-base font-semibold transition-all",
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

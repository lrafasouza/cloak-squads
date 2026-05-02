"use client";

import { VaultIdenticon } from "@/components/ui/vault-identicon";
import { cn } from "@/lib/utils";
import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";

interface VaultAvatarPickerProps {
  seed: string;
  avatarDataUrl: string;
  onAvatar: (value: string) => void;
}

export function VaultAvatarPicker({ seed, avatarDataUrl, onAvatar }: VaultAvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Use an image file.");
      return;
    }
    if (file.size > 256_000) {
      setError("Max 256 KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => onAvatar(String(reader.result));
    reader.onerror = () => setError("Could not read image.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative h-16 w-16 overflow-hidden rounded-xl border border-border-strong bg-surface-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        )}
        aria-label="Choose vault avatar"
      >
        {avatarDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarDataUrl} alt="" className="h-full w-full object-cover" />
        ) : seed ? (
          <VaultIdenticon seed={seed} size={64} className="h-16 w-16" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImagePlus className="h-6 w-6 text-ink-subtle" />
          </div>
        )}
        <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-bg/90 text-ink-muted">
          <ImagePlus className="h-3.5 w-3.5" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      {avatarDataUrl && (
        <button
          type="button"
          onClick={() => onAvatar("")}
          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-ink-subtle hover:text-ink"
          aria-label="Remove vault avatar"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {error && (
        <p className="absolute left-0 top-full mt-1 whitespace-nowrap text-[10px] text-signal-danger">
          {error}
        </p>
      )}
    </div>
  );
}

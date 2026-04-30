"use client";

import { generateIdenticon } from "@/lib/identicon";

interface VaultIdenticonProps {
  seed: string;
  size?: number;
  className?: string;
}

export function VaultIdenticon({ seed, size = 40, className }: VaultIdenticonProps) {
  const src = generateIdenticon(seed, size);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Vault identicon"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  );
}

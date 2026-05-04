"use client";

import { cn } from "@/lib/utils";
import { useId } from "react";

interface TokenLogoProps {
  symbol: "SOL" | "USDC";
  size?: number;
  className?: string;
}

function SolLogo({ size }: { size: number }) {
  const uid = useId();
  const id = `sol-g${uid.replace(/:/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SOL"
    >
      <title>SOL</title>
      <defs>
        <linearGradient id={id} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9945FF" />
          <stop offset="100%" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="#131313" />
      {/* 3 Solana bars — each a parallelogram leaning upper-right → lower-left */}
      <polygon points="8,5 26,5 23,10 5,10" fill={`url(#${id})`} />
      <polygon points="8,13 26,13 23,18 5,18" fill={`url(#${id})`} />
      <polygon points="8,21 26,21 23,26 5,26" fill={`url(#${id})`} />
    </svg>
  );
}

function UsdcLogo({ size }: { size: number }) {
  // Circle USDC logo — #2775CA blue circle, white $ mark
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="USDC"
    >
      <title>USDC</title>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      {/* Outer ring arc (decorative) */}
      <circle
        cx="16"
        cy="16"
        r="11.5"
        stroke="white"
        strokeWidth="1.5"
        fill="none"
        opacity="0.35"
      />
      {/* Dollar sign */}
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fill="white"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="14"
      >
        $
      </text>
    </svg>
  );
}

export function TokenLogo({ symbol, size = 20, className }: TokenLogoProps) {
  return (
    <span className={cn("inline-flex shrink-0", className)} aria-hidden>
      {symbol === "SOL" ? <SolLogo size={size} /> : <UsdcLogo size={size} />}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";

function formatHMS(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  }
  if (m > 0) {
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${s}s`;
}

/**
 * Live countdown to a unix-ms target. The on-chain program is the source of
 * truth for whether an action is unlocked — this is purely display.
 */
export function Countdown({ to, className }: { to: number; className?: string }) {
  const [remaining, setRemaining] = useState(() => to - Date.now());

  useEffect(() => {
    setRemaining(to - Date.now());
    const id = setInterval(() => setRemaining(to - Date.now()), 1000);
    return () => clearInterval(id);
  }, [to]);

  if (remaining <= 0) return null;

  return <span className={className}>{formatHMS(remaining)}</span>;
}

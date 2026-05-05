"use client";

import { useEffect } from "react";

/**
 * Block accidental tab close / refresh while critical work is in progress
 * (ZK proof generation, transaction submission, etc).
 *
 * Browsers ignore the custom message — they show their own generic "Leave site?"
 * prompt. The point is the prompt itself, not the wording.
 *
 * Pass `active=true` while the work is running, `false` when it's done.
 */
export function useUnloadGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    const handler = (event: BeforeUnloadEvent) => {
      // Required for Chrome/Edge to show the prompt
      event.preventDefault();
      // Required for Firefox/Safari (legacy property; ignored by most browsers)
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

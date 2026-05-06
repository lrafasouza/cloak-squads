import type { Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Lazily creates a Shiki highlighter, scoped to the langs and theme used on
 * the landing page. Cached as a singleton across the page lifetime.
 */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["vitesse-dark"],
        langs: ["typescript", "tsx", "bash", "json"],
      }),
    );
  }
  return highlighterPromise;
}

export const SHIKI_THEME = "vitesse-dark" as const;

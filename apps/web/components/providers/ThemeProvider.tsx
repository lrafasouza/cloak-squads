"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Aegis theme system.
 *
 * Three-state: "system" (follows OS), "light" (Heraldic Light), "dark" (Heraldic Dark).
 * Persisted in localStorage under `aegis:theme`.
 *
 * The matching no-flash inline script lives in `app/layout.tsx` <head> so the
 * `dark` class lands on <html> BEFORE React mounts. This provider only handles
 * post-mount changes (toggle, OS preference reactivity).
 */

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "aegis:theme";
const DEFAULT_THEME: Theme = "dark"; // Heraldic Dark is the brand default

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
  }
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read initial theme synchronously from the same key the inline <head>
  // script wrote. We can't call localStorage during SSR, so fall back to
  // DEFAULT_THEME on the server; the inline script already painted correctly.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "system" || stored === "light" || stored === "dark") return stored;
    } catch {}
    return DEFAULT_THEME;
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") return "dark";
    return theme === "system" ? getSystemTheme() : theme;
  });

  // Apply theme + listen to OS changes when theme === "system"
  useEffect(() => {
    const next: ResolvedTheme = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {}

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const sys: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolvedTheme(sys);
      applyTheme(sys);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const v = e.newValue as Theme;
      if (v === "system" || v === "light" || v === "dark") setThemeState(v);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const current = prev === "system" ? getSystemTheme() : prev;
      return current === "dark" ? "light" : "dark";
    });
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggle }),
    [theme, resolvedTheme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Soft fallback so non-tree consumers (e.g., during tests) don't crash.
    return {
      theme: DEFAULT_THEME,
      resolvedTheme: "dark",
      setTheme: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}

/**
 * The exact contents of the no-flash <script>. Exported as a string so
 * `app/layout.tsx` can render it via dangerouslySetInnerHTML *inside <head>*
 * and run before any paint.
 *
 * Keep ASCII-safe and minified; this runs synchronously on every page.
 */
export const themeNoFlashScript = `
(function(){try{
  var k='${STORAGE_KEY}';
  var s=localStorage.getItem(k);
  var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  var r=(s==='light'||s==='dark')?s:(s==='system'?sys:'${DEFAULT_THEME === "dark" ? "dark" : "light"}');
  var el=document.documentElement;
  if(r==='dark'){el.classList.add('dark');el.classList.remove('light');}
  else{el.classList.add('light');el.classList.remove('dark');}
  el.style.colorScheme=r;
}catch(e){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}})();
`;

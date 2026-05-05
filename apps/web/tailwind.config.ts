import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

/**
 * Aegis design tokens.
 *
 * Paleta heraldic-dark, accent ouro brunido (#C9A86A), tipografia Fraunces/Inter/Geist Mono.
 * Documentação completa em `docs/REDESIGN.md`.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", md: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        bg: "hsl(var(--bg) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          2: "hsl(var(--surface-2) / <alpha-value>)",
          3: "hsl(var(--surface-3) / <alpha-value>)",
        },
        border: {
          DEFAULT: "hsl(var(--border) / <alpha-value>)",
          strong: "hsl(var(--border-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "hsl(var(--ink) / <alpha-value>)",
          muted: "hsl(var(--ink-muted) / <alpha-value>)",
          subtle: "hsl(var(--ink-subtle) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          hover: "hsl(var(--accent-hover) / <alpha-value>)",
          soft: "hsl(var(--accent-soft) / <alpha-value>)",
          ink: "hsl(var(--accent-ink) / <alpha-value>)",
        },
        signal: {
          positive: "hsl(var(--signal-positive) / <alpha-value>)",
          warn: "hsl(var(--signal-warn) / <alpha-value>)",
          danger: "hsl(var(--signal-danger) / <alpha-value>)",
        },
        background: "hsl(var(--bg) / <alpha-value>)",
        foreground: "hsl(var(--ink) / <alpha-value>)",
        muted: {
          DEFAULT: "hsl(var(--surface-2) / <alpha-value>)",
          foreground: "hsl(var(--ink-muted) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-ink) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Fraunces", "ui-serif", "Georgia", "serif"],
        garamond: ["var(--font-garamond)", "EB Garamond", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Geist Mono", "ui-monospace", "Menlo", "monospace"],
      },
      fontSize: {
        "display-sm": ["clamp(2.25rem, 4vw, 3rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        display: ["clamp(3rem, 6vw, 4.75rem)", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "display-lg": ["clamp(3.75rem, 8vw, 6.5rem)", { lineHeight: "0.98", letterSpacing: "-0.035em" }],
      },
      letterSpacing: {
        eyebrow: "0.18em",
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
        "2xl": "24px",
        "3xl": "32px",
      },
      boxShadow: {
        "raise-1": "0 1px 0 0 hsl(var(--border) / 1), 0 8px 24px -12px rgb(0 0 0 / 0.6)",
        "raise-2": "0 1px 0 0 hsl(var(--border) / 1), 0 18px 48px -20px rgb(0 0 0 / 0.7)",
        "accent-glow": "0 0 0 1px hsl(var(--accent) / 0.35), 0 8px 32px -8px hsl(var(--accent) / 0.25)",
        "accent-glow-md": "0 0 0 1px hsl(var(--accent) / 0.25), 0 16px 48px -12px hsl(var(--accent) / 0.2)",
        "glass": "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 0 hsl(var(--ink) / 0.04)",
      },
      zIndex: {
        drawer: "50",
        modal: "60",
        toast: "70",
        cmdk: "80",
      },
      transitionTimingFunction: {
        "aegis": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px -4px hsl(var(--accent) / 0.15)" },
          "50%": { boxShadow: "0 0 28px -2px hsl(var(--accent) / 0.3)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out",
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        marquee: "marquee 40s linear infinite",
        shimmer: "shimmer 3s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, hsl(var(--border) / 0.4) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.4) 1px, transparent 1px)",
        "radial-fade":
          "radial-gradient(ellipse at top, hsl(var(--accent) / 0.06), transparent 60%)",
      },
      backgroundSize: {
        "grid-md": "48px 48px",
      },
    },
  },
  plugins: [animatePlugin],
};

export default config;

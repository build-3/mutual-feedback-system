import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        line: "var(--color-line)",
        brand: {
          DEFAULT: "#f5bb9f",
          peach: "#f5bb9f",
          sky: "#c6e5f8",
          sage: "#79c0a6",
          yellow: "#fff392",
          pink: "#f4bfd0",
          lavender: "#bcadcc",
          black: "#1d1d1b",
          grey: "#9d9b9a",
          danger: "#d35b52",
        },
      },
      boxShadow: {
        brand: "var(--shadow-soft)",
        elevated: "var(--shadow-elevated)",
        "brand-hover": "var(--shadow-elevated)",
        button: "var(--shadow-button)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-up": "slide-up 0.35s ease-out both",
      },
    },
  },
  plugins: [],
}

export default config

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        poppins: ["var(--font-poppins)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        sales: { DEFAULT: "hsl(var(--sales))" },
        "surface-base": "var(--color-surface-base)",
        "surface-raised": "var(--color-surface-raised)",
        "surface-card": "var(--color-surface-card)",
        "surface-card-alt": "var(--color-surface-card-alt)",
        brand: {
          DEFAULT: "hsl(var(--brand))",
          hover: "hsl(var(--brand-hover))",
          soft: "hsl(var(--brand-soft))",
        },
        "border-subtle": "var(--color-border-subtle)",
        "text-muted": "var(--color-text-muted)",
      },
      spacing: {
        "proc-container-x": "1rem",
        "proc-section-y": "4rem",
        "proc-section-y-lg": "5rem",
        "proc-gap-section": "2rem",
        "proc-gap-card": "1.5rem",
        "proc-card-p": "1.25rem",
        "proc-card-p-lg": "1.5rem",
      },
      maxWidth: {
        proc: "80rem",
      },
      borderRadius: {
        "2xl": "1rem",
      },
      boxShadow: {
        "proc-sm": "0 1px 3px rgb(0 0 0 / 0.35)",
        "proc-md": "0 4px 14px rgb(240 98 50 / 0.25)",
        "proc-brand": "0 6px 20px rgb(240 98 50 / 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;

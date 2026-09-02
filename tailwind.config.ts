import type { Config } from "tailwindcss";

/**
 * Compass 1.0 Design System — Tailwind v4 config
 *
 * All semantic color tokens are mapped from CSS custom properties defined in
 * globals.css. The config below makes them available as Tailwind utilities
 * (e.g. `bg-surface`, `text-text-muted`, `border-border`, etc.).
 */
const config: Config = {
  /* ---------------------------------------------------------------
     Content paths — scan for class usage
  --------------------------------------------------------------- */
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],

  /* ---------------------------------------------------------------
     Dark mode — driven by the .dark class (next-themes compatible)
  --------------------------------------------------------------- */
  darkMode: "class",

  theme: {
    extend: {
      /* ---------------------------------------------------------
         Colors — Compass 1.0 semantic tokens + palette
      --------------------------------------------------------- */
      colors: {
        /* Semantic surface / layout tokens */
        bg:             "var(--bg)",
        surface:        "var(--surface)",
        "surface-raised": "var(--surface-raised)",

        /* Semantic typography tokens */
        text:           "var(--text)",
        "text-muted":   "var(--text-muted)",

        /* Semantic border */
        border:         "var(--border)",

        /* Accent — Red/300 light, Red/200 dark */
        accent:         "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-fg":    "var(--accent-fg)",

        /* Focus ring */
        ring:           "var(--ring)",

        /* Sidebar / Nav */
        sidebar: {
          bg:          "var(--sidebar-bg)",
          text:        "var(--sidebar-text)",
          muted:       "var(--sidebar-muted)",
          border:      "var(--sidebar-border)",
          active:      "var(--sidebar-active)",
          "active-text": "var(--sidebar-active-text)",
        },

        /* Card */
        card: {
          bg:     "var(--card-bg)",
          border: "var(--card-border)",
        },

        /* Input */
        input: {
          bg:          "var(--input-bg)",
          border:      "var(--input-border)",
          "border-focus": "var(--input-border-focus)",
          text:        "var(--input-text)",
          placeholder: "var(--input-placeholder)",
        },

        /* Button */
        btn: {
          "primary-bg":       "var(--btn-primary-bg)",
          "primary-text":     "var(--btn-primary-text)",
          "primary-hover-bg": "var(--btn-primary-hover-bg)",
          "secondary-bg":     "var(--btn-secondary-bg)",
          "secondary-text":   "var(--btn-secondary-text)",
          "secondary-border": "var(--btn-secondary-border)",
          "ghost-text":       "var(--btn-ghost-text)",
          "ghost-hover-bg":   "var(--btn-ghost-hover-bg)",
        },

        /* Compass 1.0 color primitives — available as neutrals-*, sand-*, etc. */
        neutrals: {
          50:  "#F8F8F8",
          100: "#F5F5F5",
          200: "#F2F2F2",
          300: "#DDDDDD",
          400: "#B8B8B8",
          500: "#858585",
          600: "#5C5C5C",
          700: "#333333",
          800: "#232323",
          900: "#1C1C1C",
        },
        sand: {
          100: "#DCDBD3",
          200: "#CBCABF",
          300: "#BAB8AC",
          400: "#8E8C82",
          500: "#626158",
        },
        gold: {
          100: "#DBCAA5",
          200: "#C8B17D",
          300: "#B59756",
          400: "#9E8142",
          500: "#856B30",
        },
        "compass-red": {
          100: "#FF907A",
          200: "#FA623D",
          300: "#4F46E5",
          400: "#CB2500",
          500: "#991600",
        },
      },

      /* ---------------------------------------------------------
         Typography — font families
      --------------------------------------------------------- */
      fontFamily: {
        fragment: ['"PP Fragment"', "Georgia", "serif"],
        aeonik:   ["Aeonik", "Inter", "system-ui", "sans-serif"],
      },

      /* ---------------------------------------------------------
         Font sizes — Compass 1.0 type scale
         Format: [fontSize, { lineHeight }]
      --------------------------------------------------------- */
      fontSize: {
        "display-l": ["3.5rem",   { lineHeight: "4rem" }],    /* 56/64 */
        "display-m": ["2.5rem",   { lineHeight: "3rem" }],    /* 40/48 */
        "display-s": ["2rem",     { lineHeight: "2.5rem" }],  /* 32/40 */
        "heading-l": ["1.75rem",  { lineHeight: "2.25rem" }], /* 28/36 */
        "heading-m": ["1.5rem",   { lineHeight: "2rem" }],    /* 24/32 */
        "heading-s": ["1.25rem",  { lineHeight: "1.75rem" }], /* 20/28 */
        body:        ["1rem",     { lineHeight: "1.5rem" }],  /* 16/24 */
        small:       ["0.875rem", { lineHeight: "1.25rem" }], /* 14/20 */
        caption:     ["0.75rem",  { lineHeight: "1rem" }],    /* 12/16 */
      },

      /* ---------------------------------------------------------
         Border radius — Compass scale
      --------------------------------------------------------- */
      borderRadius: {
        none: "0",
        xs:   "0.125rem",  /* 2px  */
        sm:   "0.25rem",   /* 4px  */
        md:   "0.375rem",  /* 6px  */
        lg:   "0.5rem",    /* 8px  */
        xl:   "0.75rem",   /* 12px */
        "2xl": "1rem",     /* 16px */
        "3xl": "1.5rem",   /* 24px */
        full: "9999px",
      },

      /* ---------------------------------------------------------
         Spacing additions
      --------------------------------------------------------- */
      spacing: {
        18:      "4.5rem",
        22:      "5.5rem",
        sidebar: "15rem",   /* 240px — sidebar width */
      },

      /* ---------------------------------------------------------
         Box shadows — Compass elevation scale
      --------------------------------------------------------- */
      boxShadow: {
        card:   "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        raised: "0 4px 12px 0 rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.08)",
        modal:  "0 20px 60px 0 rgb(0 0 0 / 0.20), 0 8px 16px -4px rgb(0 0 0 / 0.12)",
      },

      /* ---------------------------------------------------------
         Transition durations / easings
      --------------------------------------------------------- */
      transitionDuration: {
        base:   "150ms",
        medium: "250ms",
        slow:   "400ms",
      },
      transitionTimingFunction: {
        "compass": "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      /* ---------------------------------------------------------
         Ring — uses semantic accent color by default
      --------------------------------------------------------- */
      ringColor: {
        DEFAULT: "var(--ring)",
        accent:  "var(--accent)",
      },
      ringOffsetColor: {
        bg:      "var(--bg)",
        surface: "var(--surface)",
      },
    },
  },

  plugins: [],
};

export default config;

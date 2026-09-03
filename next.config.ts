import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development'

/**
 * The Supabase origin this deployment actually talks to.
 *
 * Locally that is http://127.0.0.1:54321 — plain HTTP on another port — which
 * neither the `https:` CSP source nor the *.supabase.co remote pattern covers.
 * Article images then fail to load with nothing but a CSP violation in the
 * console: the files exist, are public, and serve fine when fetched directly.
 * Deriving the origin keeps every environment correct without an allowlist.
 */
const supabaseOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
})()

const supabaseRemotePattern = supabaseOrigin
  ? (() => {
      const { protocol, hostname, port } = new URL(supabaseOrigin)
      return [{
        protocol: protocol.replace(':', '') as 'http' | 'https',
        hostname,
        port,
        pathname: '/storage/v1/object/**',
      }]
    })()
  : []

const nextConfig: NextConfig = {
  /* ---------------------------------------------------------------
     TypeScript — fail the build on type errors
  --------------------------------------------------------------- */
  typescript: {
    ignoreBuildErrors: false,
  },

  /* ---------------------------------------------------------------
     Images — allow Supabase storage as a remote source
  --------------------------------------------------------------- */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.in",
        port: "",
        pathname: "/storage/v1/object/**",
      },
      ...supabaseRemotePattern,
    ],
  },

  /* ---------------------------------------------------------------
     Security headers
     Scope: internal tool accessed only by @example.com accounts
  --------------------------------------------------------------- */
  async headers() {
    return [
      {
        /* Apply to all routes */
        source: "/(.*)",
        headers: [
          /* Prevent clickjacking */
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          /* Prevent MIME sniffing */
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          /* Referrer policy — no cross-origin leakage */
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          /* Permissions policy — restrict unused browser features */
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "interest-cohort=()",
              "payment=()",
              "usb=()",
            ].join(", "),
          },
          /* HSTS — 1 year, include subdomains */
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          /* X-DNS-Prefetch-Control */
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          /**
           * Content Security Policy
           *
           * Strict for the @example.com internal tool:
           * - self + Supabase API/storage
           * - Vercel (if hosted there)
           * - No inline scripts (nonce injected by Next.js middleware if needed)
           *
           * Adjust 'connect-src' with your actual Supabase project URL after
           * project creation.
           */
          {
            key: "Content-Security-Policy",
            value: [
              /* Base */
              "default-src 'self'",

              /* Scripts — unsafe-eval required by React/Turbopack in dev */
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",

              /* Styles — Tailwind injects inline styles */
              "style-src 'self' 'unsafe-inline'",

              /**
               * Images — any HTTPS host. Brand logos are operator-supplied
               * URLs on arbitrary CDNs and Google profile avatars come from
               * googleusercontent.com; an allowlist silently breaks both.
               */
              ["img-src", "'self'", "data:", "blob:", "https:", supabaseOrigin]
                .filter(Boolean)
                .join(" "),

              /**
               * Fonts — the local /fonts/ dir. `data:` is allowed because
               * browser extensions inject data-URI fonts into the page and the
               * console errors they produce are indistinguishable from ours.
               */
              "font-src 'self' data:",

              /* Connections — Next.js HMR (dev) + Supabase + Inngest */
              [
                "connect-src",
                "'self'",
                "https://*.supabase.co",
                "https://*.supabase.in",
                "wss://*.supabase.co",
                "https://inn.gs",           /* Inngest cloud */
                "https://api.inngest.com",
                /* The configured Supabase origin — covers local HTTP too. */
                supabaseOrigin,
                supabaseOrigin?.replace(/^http/, 'ws'),
                /* Local Inngest dev server. */
                isDev ? "http://127.0.0.1:8288" : null,
              ].filter(Boolean).join(" "),

              /* Media */
              ["media-src", "'self'", "blob:", "https://*.supabase.co", supabaseOrigin]
                .filter(Boolean)
                .join(" "),

              /* Workers */
              "worker-src 'self' blob:",

              /* Forms may only post back to this origin */
              "form-action 'self'",

              /* Only this origin may be navigated to as a base */
              "base-uri 'self'",

              /* Frames — block all (internal tool) */
              "frame-src 'none'",
              "frame-ancestors 'none'",

              /* Objects */
              "object-src 'none'",

              /* Manifests */
              "manifest-src 'self'",

              /* Upgrade insecure requests */
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },

      /* Static assets — long-lived cache only in production (dev HMR needs no-cache) */
      ...(!isDev ? [{
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      }] : []),

      /* Public fonts */
      {
        source: "/fonts/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: isDev ? "no-store" : "public, max-age=31536000, immutable",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

/**
 * Basic CSP compatible with Next.js (inline hydration scripts), Tailwind
 * (inline styles), and Supabase Auth (HTTPS + WebSocket to *.supabase.co).
 * Server-side fetches (e.g. university research) are not constrained by CSP.
 */
function buildContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join("; ");
}

function buildSecurityHeaders(): { key: string; value: string }[] {
  const headers: { key: string; value: string }[] = [
    {
      key: "X-Frame-Options",
      value: "DENY"
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff"
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin"
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy()
    }
  ];

  // HSTS only on Vercel (HTTPS). Omit on local `npm run dev` to avoid dev pitfalls.
  if (process.env.VERCEL === "1") {
    headers.unshift({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload"
    });
  }

  return headers;
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders()
      }
    ];
  }
};

export default nextConfig;

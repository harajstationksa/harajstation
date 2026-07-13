import type { NextConfig } from "next";

// Lenient-but-real CSP: Next.js needs inline scripts for hydration; everything
// else is locked to same-origin. Tighten with nonces later if needed.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // https: so images served from the R2 CDN domain load
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS is ignored over plain HTTP, so it is safe to always send
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Derived from the server-only credential so there is one switch, not two:
  // the Google button only renders when sign-in can actually work.
  env: {
    NEXT_PUBLIC_GOOGLE_ENABLED: process.env.GOOGLE_CLIENT_ID ? "1" : "",
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;

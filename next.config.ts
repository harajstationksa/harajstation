import type { NextConfig } from "next";

// Lenient-but-real CSP: Next.js needs inline scripts for hydration; everything
// else is locked to same-origin. Tighten with nonces later if needed.
// unsafe-eval is a dev-only need (webpack eval sourcemaps) — production
// bundles never eval, so don't hand that power to injected markup there.
const CSP = [
  "default-src 'self'",
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
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
  experimental: {
    // Having a proxy.ts makes Next buffer every request body so it can be read
    // twice, and it TRUNCATES anything past this limit — silently, with the
    // request still going through. The default 10MB was under a listing's max
    // upload (10 images x 5MB), so a seller with phone photos got a chopped
    // multipart body and a "bad request" they could do nothing about.
    // Keep this at or above nginx's client_max_body_size.
    proxyClientMaxBodySize: "60mb",
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;

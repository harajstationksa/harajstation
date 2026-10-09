import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // HSTS is ignored over plain HTTP, so it is safe to always send
  {
    key: "Strict-Transport-Security",
    value:
      "max-age=63072000; includeSubDomains" +
      (process.env.HSTS_PRELOAD === "true" ? "; preload" : ""),
  },
];

const nextConfig: NextConfig = {
  // The public switch is explicit; the server credential remains a fallback
  // for older environment files.
  env: {
    // Explicit public switch; the server credential is only a fallback for older env files.
    NEXT_PUBLIC_GOOGLE_ENABLED:
      process.env.NEXT_PUBLIC_GOOGLE_ENABLED ?? (process.env.GOOGLE_CLIENT_ID ? "1" : ""),
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

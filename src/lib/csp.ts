function imageOrigins() {
  const origins = ["'self'", "data:", "blob:", "https://*.googleusercontent.com"];
  if (process.env.R2_PUBLIC_URL) {
    try {
      const url = new URL(process.env.R2_PUBLIC_URL);
      if (url.protocol === "https:") origins.push(url.origin);
    } catch {
      /* Invalid configuration is denied. */
    }
  }
  return origins.join(" ");
}
/** Script/style elements use a per-request nonce; React style attributes remain supported. */
export function contentSecurityPolicy(nonce: string, development = false) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src ${imageOrigins()}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.tiktok.com",
    "object-src 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

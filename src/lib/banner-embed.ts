const ALLOWED_EMBEDS: Array<{ hosts: string[]; path: RegExp }> = [
  {
    hosts: ["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"],
    path: /^\/embed\/[A-Za-z0-9_-]+\/?$/,
  },
  { hosts: ["player.vimeo.com"], path: /^\/video\/\d+\/?$/ },
  { hosts: ["www.tiktok.com"], path: /^\/player\/v1\/\d+\/?$/ },
];

/** Convert legacy iframe HTML or a URL into a strict, renderable provider URL. */
export function safeBannerEmbedUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  const src = /^https:\/\//i.test(raw)
    ? raw
    : raw.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!src) return null;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const allowed = ALLOWED_EMBEDS.some(
      (rule) => rule.hosts.includes(url.hostname.toLowerCase()) && rule.path.test(url.pathname)
    );
    if (!allowed) return null;
    // Fragments are unnecessary and can create inconsistent provider behavior.
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

import { createHash } from "node:crypto";

/**
 * A stable per-visitor key derived from IP (+ a coarse UA slice), so reloads
 * from the same client don't inflate view counts. Hashed so raw IPs are never
 * stored (PDPL-friendly).
 */
export function visitorKey(req: Request): string {
  const h = req.headers;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  const ua = (h.get("user-agent") ?? "").slice(0, 40);
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32);
}

/**
 * A coarser network-level key: the visitor's /24 subnet (IPv4) or /48 prefix
 * (IPv6). Used to dedupe ad impressions — reloads, and even multiple devices
 * behind the same home network, count as ONE impression for a campaign.
 */
export function subnetKey(h: { get(name: string): string | null }): string {
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  let net = ip;
  if (ip.includes(".")) {
    // IPv4 → zero the host octet: 203.0.113.7 → 203.0.113.0/24
    net = ip.split(".").slice(0, 3).join(".") + ".0/24";
  } else if (ip.includes(":")) {
    // IPv6 → keep the /48 routing prefix
    net = ip.split(":").slice(0, 3).join(":") + "::/48";
  }
  return createHash("sha256").update(net).digest("hex").slice(0, 32);
}

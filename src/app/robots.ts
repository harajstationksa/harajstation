import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/**
 * robots.txt
 *
 * Two rules drive everything here:
 *
 * 1. NEVER block a page we want de-indexed. Filtered views (?city=, ?sort=…)
 *    carry `noindex, follow` in their <head>, and a crawler must be allowed to
 *    fetch them to read that — a Disallow would hide the noindex, leaving the
 *    URL indexable-by-reference while blocking the crawler from following it
 *    through to the listings inside. The canonical + noindex do this job; robots
 *    stays out of it.
 *
 * 2. Only private or pointless paths are blocked. Everything a buyer can see,
 *    a crawler can see.
 *
 * The AI split below is deliberate: bots that cite and link back are traffic,
 * bots that only harvest for training are cost. See the comments per group.
 */

/** Nothing here is public, or it is public but useless in a search result. */
const PRIVATE = [
  "/admin",
  "/admin-login",
  "/dashboard",
  "/api/",
  "/login",
  "/register",
  "/forgot",
  "/reset",
  "/verify-email",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ── the open web ──────────────────────────────────────────────────
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE,
      },

      // ── the engines that actually send Saudi traffic ──────────────────
      // Called out explicitly so a future tightening of the "*" rule can never
      // accidentally starve the two crawlers that matter most.
      {
        userAgent: ["Googlebot", "Bingbot"],
        allow: "/",
        disallow: PRIVATE,
      },
      // listing photos are the product — let them into image search
      {
        userAgent: ["Googlebot-Image", "Bingbot-Image"],
        allow: ["/uploads/", "/images/", "/opengraph-image"],
        disallow: PRIVATE,
      },

      // ── answer engines: they cite the source and send the click ───────
      {
        userAgent: [
          "OAI-SearchBot", // ChatGPT search results
          "ChatGPT-User", // a person asked ChatGPT to open the page
          "PerplexityBot",
          "Perplexity-User",
          "Claude-SearchBot",
          "Claude-User",
        ],
        allow: "/",
        disallow: PRIVATE,
      },

      // ── training-only harvesters: all cost, no referral ───────────────
      // Google-Extended is Gemini's training feed and is NOT used for Search
      // ranking — blocking it costs nothing in the results page.
      {
        userAgent: [
          "GPTBot",
          "CCBot",
          "ClaudeBot",
          "anthropic-ai",
          "Google-Extended",
          "Applebot-Extended",
          "Meta-ExternalAgent",
          "Bytespider",
        ],
        disallow: "/",
      },

      // ── commercial SEO scrapers ───────────────────────────────────────
      // They crawl hard and give nothing back. The server handles a few dozen
      // requests a second; a backlink crawler at full tilt is a self-inflicted
      // outage, and blocking them does not affect our own use of these tools.
      {
        userAgent: [
          "AhrefsBot",
          "SemrushBot",
          "MJ12bot",
          "DotBot",
          "DataForSeoBot",
          "BLEXBot",
          "PetalBot",
        ],
        disallow: "/",
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}

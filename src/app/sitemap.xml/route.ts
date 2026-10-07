import { sitemapParts, xmlEscape } from "@/lib/sitemap-data";
import { SITE } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function GET() {
  const parts = await sitemapParts();
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${parts.map((p) => `<sitemap><loc>${xmlEscape(`${SITE}/sitemaps/${p}.xml`)}</loc></sitemap>`).join("")}</sitemapindex>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}

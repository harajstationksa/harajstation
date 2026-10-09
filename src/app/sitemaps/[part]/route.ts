import { sitemapRows, xmlEscape } from "@/lib/sitemap-data";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ part: string }> }) {
  const { part } = await ctx.params;
  if (!part.endsWith(".xml")) return new Response("Not found", { status: 404 });
  const rows = await sitemapRows(part.slice(0, -4));
  if (!rows.length) return new Response("Not found", { status: 404 });
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map((r) => `<url><loc>${xmlEscape(r.url)}</loc>${r.updated ? `<lastmod>${r.updated.toISOString()}</lastmod>` : ""}</url>`).join("")}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}

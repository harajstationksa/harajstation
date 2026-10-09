/**
 * One-time, resumable inventory of existing active listings.
 * Default is a dry run. --apply writes only private risk metadata and preserves
 * status, feed ordering, updatedAt, and all public fields.
 */
import { db } from "../src/lib/db";
import { normalizeArabic } from "../src/lib/arabic";
import { addReviewReason, classifyListing } from "../src/lib/smart-review";

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.some((arg) => arg.startsWith("--") && arg !== "--apply"))
    throw new Error("Only --apply is supported");
  const banned = (await db.bannedWord.findMany({ select: { word: true } })).map((row) =>
    normalizeArabic(row.word),
  );
  const result = {
    mode: apply ? "apply" : "dry-run",
    scanned: 0,
    flagged: 0,
    updated: 0,
    skippedChanged: 0,
    candidates: [] as Array<{ id: string; ref: string | null; level: string; reasons: string[] }>,
  };
  let lastId = "";
  for (;;) {
    const rows = await db.listing.findMany({
      where: {
        status: "ACTIVE",
        riskLevel: "NORMAL",
        reviewedAt: null,
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      orderBy: { id: "asc" },
      take: 200,
      select: {
        id: true,
        ref: true,
        title: true,
        description: true,
        attributes: true,
        updatedAt: true,
        category: { select: { slug: true, nameAr: true, parent: { select: { slug: true } } } },
      },
    });
    if (!rows.length) break;
    for (const row of rows) {
      result.scanned++;
      let attributes: Record<string, string> = {};
      try {
        attributes = JSON.parse(row.attributes);
      } catch {}
      let review = classifyListing({
        title: row.title,
        description: row.description,
        categorySlug: row.category.slug,
        categoryName: row.category.nameAr,
        parentSlug: row.category.parent?.slug,
        attributes,
      });
      const searchableText = normalizeArabic(
        `${row.title} ${row.description} ${Object.values(attributes).join(" ")}`,
      );
      if (banned.some((word) => word && searchableText.includes(word)))
        review = addReviewReason(review, "PROHIBITED", "BANNED_WORD", "قائمة محظورات الإدارة");
      if (review.level === "NORMAL") continue;
      result.flagged++;
      result.candidates.push({
        id: row.id,
        ref: row.ref,
        level: review.level,
        reasons: review.reasons,
      });
      if (!apply) continue;
      // Prisma returns UTC Dates; PostgreSQL stores this column without a zone.
      // The optimistic condition avoids overwriting an edit or admin decision.
      const changed = await db.$executeRaw`
        UPDATE "Listing" SET "riskLevel" = ${review.level},
          "riskReasons" = ${JSON.stringify(review.reasons)},
          "riskSignals" = ${JSON.stringify(review.signals)}
        WHERE id = ${row.id} AND status = 'ACTIVE' AND "riskLevel" = 'NORMAL'
          AND "reviewedAt" IS NULL AND "updatedAt" = (${row.updatedAt} AT TIME ZONE 'UTC')`;
      if (changed) result.updated++;
      else result.skippedChanged++;
    }
    lastId = rows.at(-1)!.id;
    if (rows.length < 200) break;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .catch((error) => {
    console.error(
      "Existing-listing analysis failed",
      error instanceof Error ? error.message : "unknown",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

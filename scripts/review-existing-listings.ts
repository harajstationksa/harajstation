/** Read-only inventory for staff. Never changes an existing listing's status. */
import { db } from "../src/lib/db";
import { classifyListing } from "../src/lib/smart-review";

async function main() {
  const counts = { scanned: 0, SENSITIVE: 0, REGULATED: 0, PROHIBITED: 0 };
  const flagged: Array<{ id: string; ref: string | null; level: string; reasons: string[] }> = [];
  let cursor: string | undefined;
  do {
    const batch = await db.listing.findMany({
      where: { status: "ACTIVE" },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        ref: true,
        title: true,
        description: true,
        attributes: true,
        category: { select: { slug: true, nameAr: true, parent: { select: { slug: true } } } },
      },
    });
    if (!batch.length) break;
    for (const row of batch) {
      counts.scanned++;
      let attributes: Record<string, string> = {};
      try {
        attributes = JSON.parse(row.attributes);
      } catch {}
      const risk = classifyListing({
        title: row.title,
        description: row.description,
        categorySlug: row.category.slug,
        categoryName: row.category.nameAr,
        parentSlug: row.category.parent?.slug,
        attributes,
      });
      if (risk.level !== "NORMAL") {
        counts[risk.level]++;
        flagged.push({ id: row.id, ref: row.ref, level: risk.level, reasons: risk.reasons });
      }
    }
    cursor = batch.at(-1)?.id;
    if (batch.length < 200) break;
  } while (cursor);
  process.stdout.write(
    `${JSON.stringify({ generatedAt: new Date().toISOString(), counts, flagged }, null, 2)}\n`,
  );
}

main()
  .catch((error) => {
    console.error(
      "Read-only review inventory failed",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

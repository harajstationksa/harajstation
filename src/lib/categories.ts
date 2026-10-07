import { db } from "./db";

export type NavCategory = {
  slug: string;
  nameAr: string;
  nameEn: string;
};

/**
 * The header renders the top-level categories on every page, but they only
 * change when an admin edits the catalogue. Keep them in memory for a few
 * minutes rather than paying a database round trip per page view.
 */
const TTL_MS = 5 * 60_000;
let cached: { at: number; rows: NavCategory[] } | null = null;

export async function getNavCategories(): Promise<NavCategory[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rows;
  const rows = await db.category.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, nameAr: true, nameEn: true },
  });
  cached = { at: Date.now(), rows };
  return rows;
}

/** Call after any admin write to the catalogue. */
export function clearCategoryCache() {
  cached = null;
}

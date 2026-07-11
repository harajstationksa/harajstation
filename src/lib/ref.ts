import { db } from "./db";

/**
 * Generate the next human-readable listing reference (e.g. "SM-100234").
 * Uses a counter row in Setting; the unique constraint + retry guards against
 * the rare race. Admins search listings by this code.
 */
export async function generateListingRef(): Promise<string> {
  const key = "LISTING_SEQ";
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await db.setting.findUnique({ where: { key } });
    const n = cur ? parseInt(cur.value, 10) || 100000 : 100000;
    const next = n + 1;
    await db.setting.upsert({
      where: { key },
      create: { key, value: String(next) },
      update: { value: String(next) },
    });
    const ref = `SM-${next}`;
    const clash = await db.listing.findUnique({ where: { ref } });
    if (!clash) return ref;
  }
  return `SM-${Date.now().toString().slice(-8)}`;
}

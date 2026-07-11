import { db } from "./db";
import { normalizeArabic } from "./arabic";

/** Returns the first banned word found in the text (normalized match), or null. */
export async function findBannedWord(text: string): Promise<string | null> {
  const norm = normalizeArabic(text);
  const words = await db.bannedWord.findMany();
  for (const w of words) {
    if (norm.includes(w.word)) return w.word;
  }
  return null;
}

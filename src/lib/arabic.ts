/**
 * Arabic text normalization — applied identically at index time (listing
 * searchText) and query time so results match regardless of spelling variants:
 *   أ / إ / آ / ٱ → ا  ·  ى → ي  ·  ة → ه  ·  strip tashkeel & tatweel
 */
export function normalizeArabic(input: string): string {
  return input
    .replace(/[ً-ْٰ]/g, "") // harakat / tashkeel
    .replace(/ـ/g, "") // tatweel ـ
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenized normalized terms for scoring/fuzzy-ish matching */
export function arabicTerms(input: string): string[] {
  return normalizeArabic(input).split(" ").filter((t) => t.length > 1);
}

/** Build the indexed search text for a listing */
export function buildSearchText(...parts: (string | null | undefined)[]) {
  return normalizeArabic(parts.filter(Boolean).join(" "));
}

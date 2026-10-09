import { db } from "./db";

export type ImagePreview = { dataUrl: string; width: number; height: number };
const previews = new Map<string, { value: ImagePreview | null; until: number }>();
const waiting = new Map<string, ((value: ImagePreview | null) => void)[]>();
let scheduled = false;

// Batch concurrently rendered cards into one query, with a bounded process
// cache. Never fetch/decode the original image during a page request.
export function getImagePreview(url: string): Promise<ImagePreview | null> {
  const hit = previews.get(url);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.value);
  return new Promise((resolve) => {
    const subscribers = waiting.get(url) || [];
    subscribers.push(resolve);
    waiting.set(url, subscribers);
    if (scheduled) return;
    scheduled = true;
    setTimeout(async () => {
      scheduled = false;
      const batch = new Map(waiting);
      waiting.clear();
      try {
        const rows = await db.imagePlaceholder.findMany({
          where: { url: { in: [...batch.keys()] } },
          select: { url: true, dataUrl: true, width: true, height: true },
        });
        const found = new Map(rows.map((row) => [row.url, row]));
        for (const [key, callbacks] of batch) {
          const row = found.get(key);
          const value = row ? { dataUrl: row.dataUrl, width: row.width, height: row.height } : null;
          previews.delete(key);
          previews.set(key, { value, until: Date.now() + (value ? 300_000 : 30_000) });
          callbacks.forEach((callback) => callback(value));
        }
        while (previews.size > 1500) previews.delete(previews.keys().next().value!);
      } catch {
        // Cosmetic metadata must not take down cards or delay navigation.
        for (const callbacks of batch.values()) callbacks.forEach((callback) => callback(null));
      }
    }, 0);
  });
}

export async function getImagePreviews(urls: string[]) {
  const entries = await Promise.all(
    [...new Set(urls.filter(Boolean))].map(
      async (url) => [url, await getImagePreview(url)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

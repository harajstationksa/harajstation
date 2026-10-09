import { describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/db", () => ({ db: { imagePlaceholder: { findMany: query } } }));
import { getImagePreview, getImagePreviews } from "../src/lib/image-placeholders";

describe("public image metadata", () => {
  it("batches cards, deduplicates URLs, and caches the tiny preview", async () => {
    query.mockResolvedValueOnce([
      {
        url: "/uploads/test-a.webp",
        dataUrl: "data:image/webp;base64,test",
        width: 800,
        height: 600,
      },
    ]);
    const previews = await getImagePreviews([
      "/uploads/test-a.webp",
      "/uploads/test-a.webp",
      "/uploads/test-b.webp",
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].where.url.in).toHaveLength(2);
    expect(previews["/uploads/test-a.webp"]?.width).toBe(800);
    expect(previews["/uploads/test-b.webp"]).toBeNull();
    await getImagePreview("/uploads/test-a.webp");
    await getImagePreview("/uploads/test-b.webp");
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("keeps the original image usable when cosmetic metadata is unavailable", async () => {
    query.mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(getImagePreview("/uploads/test-unavailable.webp")).resolves.toBeNull();
  });
});

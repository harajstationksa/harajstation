import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { decode } from "blurhash";
import { createImagePreview } from "../src/lib/image-preview";
import { publicImageSource } from "../src/lib/public-image-source";
import { resolve } from "node:path";

describe("image previews", () => {
  it("encodes actual photo colors into a compact decoded preview", async () => {
    const bytes = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "#ee4411" },
    })
      .png()
      .toBuffer();
    const preview = await createImagePreview(bytes);
    expect(preview.width).toBe(80);
    expect(preview.height).toBe(40);
    const pixels = decode(preview.blurHash, 4, 4);
    expect(pixels[0]).toBeGreaterThan(220);
    expect(pixels[2]).toBeLessThan(40);
    expect(preview.dataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(preview.dataUrl.length).toBeLessThan(1000);
  });
  it("handles grayscale and EXIF orientation", async () => {
    const bytes = await sharp({
      create: { width: 40, height: 80, channels: 3, background: "#777777" },
    })
      .greyscale()
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const preview = await createImagePreview(bytes);
    expect([preview.width, preview.height]).toEqual([80, 40]);
    expect(() => decode(preview.blurHash, 4, 4)).not.toThrow();
  });
  it("limits backfill to public assets and the configured image host", () => {
    const root = resolve("public");
    expect(publicImageSource("/images/ph/chair1.svg", root)).toEqual({
      file: resolve(root, "images/ph/chair1.svg"),
    });
    for (const url of [
      "/uploads/../../secret",
      "/uploads/%2e%2e/secret",
      "/private-uploads/id.webp",
      "https://127.0.0.1/image",
      "https://cdn.test.evil/a.webp",
      "https://cdn.test/photos/../secret.webp",
    ])
      expect(publicImageSource(url, root, "https://cdn.test/photos")).toBeNull();
    expect(
      publicImageSource("https://cdn.test/photos/a.webp", root, "https://cdn.test/photos"),
    ).toEqual({ url: "https://cdn.test/photos/a.webp" });
  });
});

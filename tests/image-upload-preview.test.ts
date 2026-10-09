import { expect, it } from "vitest";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { deleteImages, saveImages } from "../src/lib/uploads";

it("saves preview metadata automatically with a new public image upload", async () => {
  process.env.R2_ACCESS_KEY_ID = "";
  process.env.R2_SECRET_ACCESS_KEY = "";
  const image = await sharp({
    create: { width: 120, height: 60, channels: 3, background: "#e56338" },
  })
    .png()
    .toBuffer();
  const result = await saveImages([
    new File([new Uint8Array(image)], "preview-test.png", { type: "image/png" }),
  ]);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  try {
    const preview = await db.imagePlaceholder.findUnique({ where: { url: result.urls[0] } });
    expect(preview?.blurHash).toHaveLength(28);
    expect(preview?.dataUrl).toMatch(/^data:image\/webp;base64,/);
    expect([preview?.width, preview?.height]).toEqual([120, 60]);
  } finally {
    await deleteImages(result.urls, true);
    await db.imagePlaceholder.deleteMany({ where: { url: { in: result.urls } } });
    await db.$disconnect();
  }
});

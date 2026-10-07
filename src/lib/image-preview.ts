import sharp from "sharp";
import { SAFE_IMAGE_OPTIONS } from "./image-safety";
import { encode, decode } from "blurhash";

export async function createImagePreview(input: Buffer) {
  const image = sharp(input, SAFE_IMAGE_OPTIONS).rotate();
  const meta = await image.metadata();
  const rotated = meta.orientation && meta.orientation >= 5;
  const width = (rotated ? meta.height : meta.width) || 1;
  const height = (rotated ? meta.width : meta.height) || 1;
  const { data, info } = await image
    .resize(32, 32, { fit: "inside" })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurHash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
  const previewWidth = 32;
  const previewHeight = Math.max(4, Math.min(48, Math.round((32 * height) / width)));
  const pixels = decode(blurHash, previewWidth, previewHeight);
  const preview = await sharp(Buffer.from(pixels), {
    raw: { width: previewWidth, height: previewHeight, channels: 4 },
  })
    .webp({ quality: 65 })
    .toBuffer();
  return {
    blurHash,
    dataUrl: `data:image/webp;base64,${preview.toString("base64")}`,
    width,
    height,
  };
}

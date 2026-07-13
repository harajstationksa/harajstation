/**
 * Shrink a picture in the browser before it is uploaded.
 *
 * Worth doing even for files that are already "small enough": the server
 * re-encodes every upload to WebP at 1600px wide (lib/uploads), so sending a
 * 4MB 4000px original spends the seller's data on pixels that are thrown away —
 * and on a phone that is most of the wait when publishing.
 *
 * It also solves iPhone HEIC. Safari decodes HEIC natively, so drawing it to a
 * canvas and re-encoding hands the server a JPEG it accepts — before this, an
 * iPhone photo under 5MB was passed through untouched and rejected server-side
 * as an unsupported format.
 */
export const MAX_IMAGE = 5 * 1024 * 1024;

/** Matches the server's own cap — anything wider is downscaled there anyway. */
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function compressImage(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file.size <= MAX_IMAGE ? file : null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) return file.size <= MAX_IMAGE ? file : null;

    // a re-encode that came out bigger (already-optimised small JPEG) is no gain
    if (blob.size >= file.size && file.size <= MAX_IMAGE && isSupported(file)) {
      return file;
    }
    if (blob.size > MAX_IMAGE) return null;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // decoding failed (an exotic format) — only let it through if the server
    // would actually accept it
    return file.size <= MAX_IMAGE && isSupported(file) ? file : null;
  }
}

function isSupported(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

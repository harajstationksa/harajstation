import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";

const MAX_BYTES = 5 * 1024 * 1024;

/** Only known public assets may be processed; never fetch arbitrary DB URLs. */
export function publicImageSource(url: string, publicRoot: string, remoteBase?: string) {
  if (url.includes("\\") || url.includes("%") || url.includes("?") || url.includes("#"))
    return null;
  if (url.startsWith("/images/") || url.startsWith("/uploads/")) {
    const full = resolve(publicRoot, `.${url}`);
    const part = relative(publicRoot, full);
    if (part.startsWith("..") || isAbsolute(part)) return null;
    return { file: full };
  }
  if (!remoteBase) return null;
  try {
    const base = new URL(remoteBase.replace(/\/$/, "") + "/");
    const candidate = new URL(url);
    if (
      candidate.protocol !== "https:" ||
      candidate.username ||
      candidate.password ||
      candidate.origin !== base.origin ||
      !candidate.pathname.startsWith(base.pathname)
    )
      return null;
    return { url: candidate.href };
  } catch {
    return null;
  }
}

export async function readPublicImage(url: string, publicRoot: string, remoteBase?: string) {
  const source = publicImageSource(url, publicRoot, remoteBase);
  if (!source) return null;
  if (source.file) {
    const bytes = await readFile(source.file);
    if (bytes.length > MAX_BYTES) throw new Error("Image exceeds size limit");
    return bytes;
  }
  const response = await fetch(source.url!, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES)
    throw new Error("Image unavailable or oversized");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error("Image exceeds size limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

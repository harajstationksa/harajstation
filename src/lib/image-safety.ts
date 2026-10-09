import type { SharpOptions } from "sharp";

/** Bound decoding before resizing: compressed file size does not limit pixels. */
export const SAFE_IMAGE_OPTIONS: SharpOptions = {
  limitInputPixels: 40_000_000,
  failOn: "error",
  animated: false,
};

/**
 * Decoding a 40 MP upload needs ~160 MB of pixel memory, and a listing may
 * carry 10 of them. Without a bound, a few simultaneous uploads exhaust the
 * worker's memory, so every server-side decode waits for one of a few slots.
 */
const MAX_PARALLEL_DECODES = 2;
let active = 0;
const waiting: Array<() => void> = [];

export async function withImageSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL_DECODES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    active++;
  }
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

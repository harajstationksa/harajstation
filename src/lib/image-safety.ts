import type { SharpOptions } from "sharp";

/** Bound decoding before resizing: compressed file size does not limit pixels. */
export const SAFE_IMAGE_OPTIONS: SharpOptions = {
  limitInputPixels: 40_000_000,
  failOn: "error",
  animated: false,
};

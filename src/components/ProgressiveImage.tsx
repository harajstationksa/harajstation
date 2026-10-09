"use client";

import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import type { ImagePreview } from "@/lib/image-placeholders";
import styles from "./ProgressiveImage.module.css";

export type ProgressiveImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  preview?: ImagePreview | null;
  mobilePreview?: ImagePreview | null;
};

export function ProgressiveImage({
  src,
  alt,
  preview,
  mobilePreview,
  className = "",
  style,
  onLoad,
  onError,
  ...props
}: ProgressiveImageProps) {
  const image = useRef<HTMLImageElement>(null);
  const [readySrc, setReadySrc] = useState("");
  const ready = readySrc === src;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (image.current?.complete && image.current.naturalWidth > 0) setReadySrc(src);
    });
    return () => cancelAnimationFrame(frame);
  }, [src]);
  return (
    // Native loading/SEO/keyboard semantics remain intact; no second image request.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={image}
      src={src}
      alt={alt}
      width={props.width ?? preview?.width}
      height={props.height ?? preview?.height}
      className={`${styles.image} ${className}`}
      data-image-ready={ready}
      data-blur-placeholder={!!preview}
      style={
        {
          ...style,
          "--image-preview": preview ? `url("${preview.dataUrl}")` : "none",
          "--image-preview-mobile": mobilePreview
            ? `url("${mobilePreview.dataUrl}")`
            : preview
              ? `url("${preview.dataUrl}")`
              : "none",
          backgroundSize:
            style?.objectFit === "contain" || className.includes("object-contain")
              ? "contain"
              : "cover",
        } as CSSProperties
      }
      onLoad={(event) => {
        setReadySrc(src);
        onLoad?.(event);
      }}
      onError={(event) => {
        onError?.(event);
      }}
    />
  );
}

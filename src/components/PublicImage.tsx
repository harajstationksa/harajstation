import { getImagePreview } from "@/lib/image-placeholders";
import { ProgressiveImage, type ProgressiveImageProps } from "./ProgressiveImage";

export async function PublicImage(props: ProgressiveImageProps) {
  const preview = props.preview ?? (await getImagePreview(props.src));
  return <ProgressiveImage {...props} preview={preview} />;
}

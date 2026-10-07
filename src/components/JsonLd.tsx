import { headers } from "next/headers";
/**
 * Structured data. Google reads this, users never see it.
 *
 * The JSON is stringified, not interpolated, so a listing title containing a
 * quote or an angle bracket can't break out of the <script> tag.
 */
export async function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  return (
    <script
      nonce={(await headers()).get("x-nonce") ?? undefined}
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

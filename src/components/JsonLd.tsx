/**
 * Structured data. Google reads this, users never see it.
 *
 * The JSON is stringified, not interpolated, so a listing title containing a
 * quote or an angle bracket can't break out of the <script> tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

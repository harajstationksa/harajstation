import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The card that shows when the site is shared on WhatsApp, X, or Facebook.
 *
 * Generated rather than shipped as a PNG so it stays in sync with the brand.
 * Individual listings override it with their own photo.
 *
 * The font is vendored and passed in explicitly: the renderer's built-in font
 * carries no Arabic, and its fallback cannot shape the script at all — without
 * this the whole image fails to render rather than degrading.
 */
export const alt = "حراج ستيشن — سوقك السعودي للمزادات والإعلانات";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const tajawal = await readFile(
    join(process.cwd(), "src/app/_fonts/Tajawal-Bold.ttf")
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a1614 0%, #2d2320 55%, #7c3f24 100%)",
          color: "#fff",
          fontFamily: "Tajawal",
        }}
      >
        {/* The renderer honours RTL *inside* a text run but lays sibling elements
            out left-to-right, and it ignores `direction` entirely — so a row of
            spans has to be reversed by hand or the brand reads «ستيشن حراج». */}
        <div
          style={{
            display: "flex",
            flexDirection: "row-reverse",
            gap: 22,
            fontSize: 104,
            letterSpacing: -2,
          }}
        >
          <span style={{ color: "#f97316" }}>حراج</span>
          <span>ستيشن</span>
        </div>
        <div style={{ fontSize: 40, marginTop: 24, color: "#e7e0dc" }}>
          سوقك السعودي للمزادات والإعلانات
        </div>
        <div
          style={{
            marginTop: 44,
            display: "flex",
            flexDirection: "row-reverse",
            gap: 16,
            fontSize: 26,
            color: "#f4a261",
          }}
        >
          <span>سيارات</span>
          <span>·</span>
          <span>عقارات</span>
          <span>·</span>
          <span>إلكترونيات</span>
          <span>·</span>
          <span>مزادات مباشرة</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Tajawal", data: tajawal, weight: 700, style: "normal" }],
    }
  );
}

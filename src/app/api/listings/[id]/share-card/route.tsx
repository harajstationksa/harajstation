import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import sharp from "sharp";
import { db } from "@/lib/db";
import { formatSAR, parseImages } from "@/lib/utils";
import { rateLimitGuard } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Ready-to-forward share card (1080×1080) for WhatsApp status & groups —
 * where most Saudi resale actually happens. Product photo, price, city and a
 * QR code that brings the group straight to the listing.
 *
 * The photo goes through sharp first: uploads are WebP (and placeholders are
 * SVG), neither of which the OG renderer accepts — re-encoded to JPEG and
 * inlined as a data URL.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const limited = await rateLimitGuard(req, "share-card", 10, 60_000);
  if (limited) return limited;

  const { id } = await ctx.params;
  const listing = await db.listing.findUnique({
    where: { id },
    select: {
      title: true,
      price: true,
      city: true,
      ref: true,
      images: true,
      status: true,
    },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const reqUrl = new URL(req.url);
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;
  const listingUrl = `${origin}/listings/${id}`;

  // ── product photo → JPEG data URL ──
  let photo: string | null = null;
  try {
    const src = parseImages(listing.images)[0];
    if (src) {
      let raw: Buffer;
      if (src.startsWith("http")) {
        raw = Buffer.from(await (await fetch(src)).arrayBuffer());
      } else if (src.startsWith("/")) {
        raw = await readFile(join(process.cwd(), "public", src));
      } else {
        raw = Buffer.from("");
      }
      if (raw.length > 0) {
        const jpeg = await sharp(raw)
          .resize(1080, 760, { fit: "cover" })
          .flatten({ background: "#f5f5f4" })
          .jpeg({ quality: 82 })
          .toBuffer();
        photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
      }
    }
  } catch {
    // photo is decoration — the card still works without it
  }

  const [tajawal, qr] = await Promise.all([
    readFile(join(process.cwd(), "src/app/_fonts/Tajawal-Bold.ttf")),
    QRCode.toDataURL(listingUrl, { width: 240, margin: 1 }),
  ]);

  const priceText =
    listing.price != null ? formatSAR(listing.price) : "على السوم";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#1a1614",
          color: "#fff",
          fontFamily: "Tajawal",
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={1080}
            height={760}
            style={{ width: 1080, height: 760, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 1080,
              height: 760,
              display: "flex",
              // the renderer lays sibling spans LTR even for Arabic — reverse
              // by hand, same trick as opengraph-image.tsx
              flexDirection: "row-reverse",
              gap: 24,
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #2d2320 0%, #7c3f24 100%)",
              fontSize: 90,
              color: "#f97316",
            }}
          >
            <span>حراج</span>
            <span>ستيشن</span>
          </div>
        )}

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "28px 44px",
            gap: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 64,
                color: "#f97316",
                display: "flex",
              }}
            >
              {priceText}
            </div>
            <div
              style={{
                fontSize: 38,
                color: "#fff",
                marginTop: 6,
                display: "flex",
                maxWidth: 760,
              }}
            >
              {listing.title.length > 48
                ? `${listing.title.slice(0, 48)}…`
                : listing.title}
            </div>
            {/* one text run — the bidi algorithm orders mixed Arabic/Latin
                correctly inside a single node (separate spans get laid LTR) */}
            <div
              style={{
                fontSize: 26,
                color: "#c9beb8",
                marginTop: 10,
                display: "flex",
              }}
            >
              {`${listing.city} · حراج ستيشن${listing.ref ? ` · ${listing.ref}` : ""}`}
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt=""
            width={200}
            height={200}
            style={{
              width: 200,
              height: 200,
              borderRadius: 16,
              background: "#fff",
            }}
          />
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: [{ name: "Tajawal", data: tajawal, weight: 700, style: "normal" }],
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": `inline; filename="haraj-${listing.ref ?? id}.png"`,
      },
    }
  );
}
